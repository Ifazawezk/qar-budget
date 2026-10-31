// Checks offline use and updates in real headless Edge: npm run check:offline
//
// It builds the app three times, each with a marker in the footer, and serves those
// builds under /qar-budget/ the way GitHub Pages does, with a ten minute cache and ETags.
// "Offline" means the server is really stopped, so the service worker's own requests fail
// too, which the offline switch in browser developer tools does not guarantee.
//
// Needs Node 22 or newer and Edge. Set EDGE_PATH if Edge is not in the usual place.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";
import { build } from "vite";
import { launchEdge } from "./edge.mjs";

const BASE = "/qar-budget/";
const WORK = resolve("node_modules/.cache/qar-budget-offline");
const FOREIGN_CACHE = "another-site-on-this-origin";
const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
};

const failures = [];

function check(name, passed, detail = "") {
  console.log(`${passed ? "pass" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!passed) failures.push(name);
}

async function buildSite(name) {
  const outDir = join(WORK, name);
  const marker = {
    name: "marker",
    enforce: "pre",
    transform: (code, id) =>
      id.endsWith("i18n.ts") ? code.replace("Nothing is uploaded.", `Build ${name}.`) : null,
  };
  await build({ logLevel: "warn", plugins: [marker], build: { outDir, emptyOutDir: true } });
  return outDir;
}

// What the server does right now. `mode: "hang"` accepts requests and never answers,
// like a phone with a signal icon but no working connection.
const site = { dir: "", mode: "up", missing: "" };

const server = createServer((request, response) => {
  if (site.mode === "hang") return;
  const { pathname } = new URL(request.url, "http://localhost");
  const file = pathname === BASE ? "index.html" : pathname.slice(BASE.length);
  const path = join(site.dir, file);
  const found = pathname.startsWith(BASE) && file !== site.missing && existsSync(path);
  if (!found || !statSync(path).isFile()) {
    response.writeHead(404).end();
    return;
  }
  const body = readFileSync(path);
  const etag = `"${createHash("sha1").update(body).digest("hex")}"`;
  const headers = {
    "content-type": TYPES[extname(path)] ?? "application/octet-stream",
    "cache-control": "max-age=600",
    etag,
  };
  if (request.headers["if-none-match"] === etag) response.writeHead(304, headers).end();
  else response.writeHead(200, headers).end(body);
});

let port = 0;

function startServer() {
  return new Promise((done) => {
    server.listen(port, "127.0.0.1", () => {
      port = server.address().port;
      done();
    });
  });
}

function stopServer() {
  return new Promise((done) => {
    server.close(done);
    server.closeAllConnections();
  });
}

const FOOTER = `document.querySelector(".footer")?.textContent ?? ""`;
const TOAST = `document.querySelector(".toast-text")?.textContent ?? ""`;
const OWN_CACHES = `caches.keys().then((names) => names.filter((n) => n.startsWith("qar-budget-")))`;
const CHECK_FOR_UPDATE = `navigator.serviceWorker.getRegistration().then((r) => r.update()).then(() => true, () => false)`;
const pause = (ms) => new Promise((done) => setTimeout(done, ms));

function addEntry(amount) {
  return `(() => {
    const form = document.querySelector(".entry-form");
    form.querySelector("input[name=amount]").value = "${amount}";
    form.querySelector("button[type=submit]").click();
    return document.querySelectorAll(".panel-list .entry").length;
  })()`;
}

async function run(edge) {
  const url = `http://127.0.0.1:${port}${BASE}`;

  console.log("\nFirst visit, online");
  const tab = await edge.newTab(url);
  // Wait before reloading: a page that is mid-load when the worker activates is not taken over.
  await tab.waitUntil(`navigator.serviceWorker.controller !== null`);
  check("The worker takes over the first visit without a reload", true);
  await tab.eval(`localStorage.setItem("qar-budget:settings", '{"theme":"light","lang":"en"}'); 1`);
  await tab.reload();
  const [cacheA] = await tab.eval(OWN_CACHES);
  const stored = await tab.eval(
    `caches.open("${cacheA}").then((c) => c.keys()).then((k) => k.map((r) => r.url.replace(location.origin, "")))`,
  );
  const expected = readdirSync(site.dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name !== "sw.js").length;
  check("The first visit stores the whole build", stored.length === expected, `${stored.length} files`);
  check("Every stored file is under the base path", stored.every((path) => path.startsWith(BASE)));
  check(
    "The worker's scope is the base path",
    (await tab.eval(`navigator.serviceWorker.ready.then((r) => r.scope)`)) === url,
  );

  const manifest = await tab.send("Page.getAppManifest");
  check("The manifest loads without errors", manifest.errors.length === 0, JSON.stringify(manifest.errors));
  const { installabilityErrors } = await tab.send("Page.getInstallabilityErrors");
  check(
    "Edge reports no reason it cannot be installed",
    installabilityErrors.length === 0,
    installabilityErrors.map((error) => error.installabilityError).join(", "),
  );

  await tab.eval(`document.querySelector(".lang-btn").click(); 1`);
  const arabic = await tab.send("Page.getAppManifest");
  check("The Arabic screen offers the Arabic manifest", arabic.url.endsWith("manifest-ar.webmanifest"), arabic.url);
  await tab.eval(`document.querySelector(".lang-btn").click(); 1`);

  await tab.eval(addEntry("111"));
  await tab.eval(`caches.open("${FOREIGN_CACHE}").then(() => 1)`);

  console.log("\nNo connection");
  await stopServer();
  const offline = await edge.newTab(url);
  await offline.waitUntil(FOOTER);
  check("A new tab opens with the server stopped", (await offline.eval(FOOTER)).includes("Build a."));
  check("Saved entries are there", (await offline.eval(`document.querySelectorAll(".panel-list .entry").length`)) === 1);
  check(
    "Styles loaded from the cache",
    (await offline.eval(`getComputedStyle(document.body).backgroundColor`)) === "rgb(245, 244, 242)",
  );
  await offline.goto(`${url}index.html?source=home-screen`);
  check("Opening with a query string works too", (await offline.eval(FOOTER)).includes("Build a."));
  check("An entry can be added offline", (await offline.eval(addEntry("222"))) === 2);
  await offline.eval(`document.querySelector(".lang-btn").click(); 1`);
  check("Arabic works offline, right to left", (await offline.eval(`document.documentElement.dir`)) === "rtl");
  await offline.eval(`document.querySelector(".lang-btn").click(); 1`);
  await offline.reload();
  check("An offline entry survives a reload", (await offline.eval(`document.querySelectorAll(".panel-list .entry").length`)) === 2);
  await offline.close();

  console.log("\nA connection that never answers");
  site.mode = "hang";
  await startServer();
  const started = Date.now();
  await tab.reload(20000);
  const waited = Date.now() - started;
  check("The app still opens, after a short wait", (await tab.eval(FOOTER)).includes("Build a."), `${waited} ms`);
  check("The wait stays under six seconds", waited < 6000);
  await stopServer();
  site.mode = "up";

  console.log("\nA new deploy while the old version is open");
  await startServer();
  site.dir = join(WORK, "b");
  check("The update check reaches the new worker", await tab.eval(CHECK_FOR_UPDATE));
  await tab.waitUntil(`document.querySelector(".toast-text")?.textContent === "A new version is ready."`);
  check("The user is told a new version is ready", true);
  check("The open page is not reloaded under the user", (await tab.eval(FOOTER)).includes("Build a."));
  await tab.waitUntil(`${OWN_CACHES}.then((names) => names.length === 1 && names[0] !== "${cacheA}")`);
  check("The old cache is removed", true);
  check(
    "A cache from another site on the origin is left alone",
    await tab.eval(`caches.has("${FOREIGN_CACHE}")`),
  );
  await pause(9000);
  check("The notice waits for the user", (await tab.eval(TOAST)) === "A new version is ready.");
  const loaded = tab.connection.waitFor("Page.loadEventFired", tab.sessionId, 15000);
  await tab.eval(`document.querySelector(".toast-action").click(); 1`);
  await loaded;
  await tab.waitUntil(FOOTER);
  check("Reload shows the new version", (await tab.eval(FOOTER)).includes("Build b."));

  await stopServer();
  await tab.reload();
  check("Offline now opens the new version", (await tab.eval(FOOTER)).includes("Build b."));
  check("Saved entries survive the update", (await tab.eval(`document.querySelectorAll(".panel-list .entry").length`)) === 2);

  console.log("\nA broken deploy");
  site.dir = join(WORK, "c");
  site.missing = `assets/${readdirSync(join(site.dir, "assets")).find((file) => file.endsWith(".js"))}`;
  await startServer();
  await tab.eval(CHECK_FOR_UPDATE);
  await pause(1500);
  const [cacheB] = await tab.eval(OWN_CACHES);
  await stopServer();
  await tab.reload();
  check("A deploy with a missing file does not break offline use", (await tab.eval(FOOTER)).includes("Build b."), cacheB);

  console.log("\nA new deploy while the app is closed");
  site.missing = "";
  await startServer();
  const fresh = await edge.newTab(url);
  await fresh.waitUntil(FOOTER);
  check("Opening online shows the new version at once", (await fresh.eval(FOOTER)).includes("Build c."));
  await fresh.waitUntil(`${OWN_CACHES}.then((names) => names.length === 1 && names[0] !== "${cacheB}")`);
  await pause(500);
  check("No notice, because it is already the new version", (await fresh.eval(TOAST)) === "");
  await stopServer();
  await fresh.reload();
  check("Offline also has the new version", (await fresh.eval(FOOTER)).includes("Build c."));
}

rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });
site.dir = await buildSite("a");
await buildSite("b");
await buildSite("c");
await startServer();

const profile = join(WORK, "profile");
mkdirSync(profile, { recursive: true });
const edge = await launchEdge(profile);
try {
  await run(edge);
} catch (error) {
  check("The checks ran to the end", false, error.message);
} finally {
  await edge.close();
  if (server.listening) await stopServer();
}

console.log(failures.length === 0 ? "\nAll offline checks passed." : `\n${failures.length} failed.`);
process.exitCode = failures.length === 0 ? 0 : 1;
