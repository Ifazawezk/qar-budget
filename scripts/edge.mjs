// A very small driver for headless Edge over the DevTools protocol.
// It uses only what ships with Node 22 and newer, so the app gains no test dependency.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const PATHS = [
  process.env.EDGE_PATH,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/microsoft-edge",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
];

// Each flag keeps background work and memory down while the checks run.
const FLAGS = [
  "--headless=new",
  "--remote-debugging-port=0",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-gpu",
  "--disable-extensions",
  "--disable-sync",
  "--disable-background-networking",
  "--disable-component-update",
  "--renderer-process-limit=2",
  "--js-flags=--max-old-space-size=128",
  "--hide-scrollbars",
];

class Connection {
  nextId = 1;
  pending = new Map();
  waiters = new Set();

  constructor(socket) {
    this.socket = socket;
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      const call = this.pending.get(message.id);
      if (call) {
        this.pending.delete(message.id);
        if (message.error) call.reject(new Error(`${call.method}: ${message.error.message}`));
        else call.resolve(message.result);
        return;
      }
      for (const waiter of this.waiters) waiter(message);
    });
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      this.socket.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }

  waitFor(method, sessionId, timeoutMs) {
    return new Promise((resolve, reject) => {
      const waiter = (message) => {
        if (message.method !== method || message.sessionId !== sessionId) return;
        clearTimeout(timer);
        this.waiters.delete(waiter);
        resolve(message.params);
      };
      const timer = setTimeout(() => {
        this.waiters.delete(waiter);
        reject(new Error(`Timed out waiting for ${method}`));
      }, timeoutMs);
      this.waiters.add(waiter);
    });
  }
}

export class Tab {
  constructor(connection, targetId, sessionId) {
    this.connection = connection;
    this.targetId = targetId;
    this.sessionId = sessionId;
  }

  send(method, params) {
    return this.connection.send(method, params, this.sessionId);
  }

  async goto(url, timeoutMs = 20000) {
    const loaded = this.connection.waitFor("Page.loadEventFired", this.sessionId, timeoutMs);
    const { errorText } = await this.send("Page.navigate", { url });
    if (errorText) {
      loaded.catch(() => {});
      throw new Error(`${url}: ${errorText}`);
    }
    await loaded;
  }

  async reload(timeoutMs = 20000) {
    const loaded = this.connection.waitFor("Page.loadEventFired", this.sessionId, timeoutMs);
    await this.send("Page.reload");
    await loaded;
  }

  async eval(expression) {
    const { result, exceptionDetails } = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (exceptionDetails) {
      throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    }
    return result.value;
  }

  async waitUntil(expression, timeoutMs = 15000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (await this.eval(expression)) return;
      if (Date.now() > deadline) throw new Error(`Timed out waiting for: ${expression}`);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  close() {
    return this.connection.send("Target.closeTarget", { targetId: this.targetId });
  }
}

export async function launchEdge(profileDir) {
  const executable = PATHS.find((path) => path && existsSync(path));
  if (!executable) throw new Error("Edge was not found. Set EDGE_PATH to its executable.");

  const child = spawn(executable, [...FLAGS, `--user-data-dir=${profileDir}`, "about:blank"], {
    stdio: ["ignore", "ignore", "pipe"],
  });
  const endpoint = await new Promise((resolve, reject) => {
    let log = "";
    const timer = setTimeout(() => reject(new Error(`Edge did not start:\n${log}`)), 20000);
    child.stderr.on("data", (chunk) => {
      log += chunk;
      const match = /DevTools listening on (ws:\S+)/.exec(log);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    child.on("exit", () => reject(new Error(`Edge exited early:\n${log}`)));
  });

  const socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve);
    socket.addEventListener("error", reject);
  });
  const connection = new Connection(socket);

  return {
    async newTab(url = "about:blank") {
      const { targetId } = await connection.send("Target.createTarget", { url: "about:blank" });
      const { sessionId } = await connection.send("Target.attachToTarget", { targetId, flatten: true });
      const tab = new Tab(connection, targetId, sessionId);
      await tab.send("Page.enable");
      await tab.send("Runtime.enable");
      if (url !== "about:blank") await tab.goto(url);
      return tab;
    },
    async close() {
      const exited = new Promise((resolve) => child.once("exit", resolve));
      await connection.send("Browser.close").catch(() => {});
      await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 3000))]);
      child.kill();
      socket.close();
    },
  };
}
