import { describe, expect, it } from "vitest";
import {
  BUILD_PLACEHOLDER,
  cacheName,
  choosePage,
  precacheFiles,
  routeRequest,
  staleCaches,
  stampBuild,
  withTimeout,
} from "./sw-rules";

const base = "https://example.github.io/qar-budget/";

describe("staleCaches", () => {
  const current = cacheName("new");

  it("removes older versions of this app's cache", () => {
    expect(staleCaches([cacheName("old"), current], current)).toEqual([cacheName("old")]);
  });

  it("leaves other sites on the same github.io origin alone", () => {
    const others = ["other-project-v1", "workbox-precache", "qar-budget", "my-qar-budget-1"];
    expect(staleCaches([...others, current], current)).toEqual([]);
  });
});

describe("precacheFiles", () => {
  it("keeps what the app needs and leaves out the worker itself", () => {
    expect(
      precacheFiles(["sw.js", "index.html", "assets/a.js", "assets/a.js.map", "icons/icon-192.png"]),
    ).toEqual(["assets/a.js", "icons/icon-192.png", "index.html"]);
  });
});

describe("routeRequest", () => {
  const precached = new Set([`${base}assets/app-abc.js`, `${base}index.html`]);
  const get = (url: string, mode = "cors") => ({ url, method: "GET", mode });

  it("treats opening any page as a navigation", () => {
    expect(routeRequest(get(base, "navigate"), precached)).toBe("page");
    expect(routeRequest(get(`${base}?source=pwa`, "navigate"), precached)).toBe("page");
    expect(routeRequest(get(`${base}index.html`, "navigate"), precached)).toBe("page");
  });

  it("serves files of this build from the cache", () => {
    expect(routeRequest(get(`${base}assets/app-abc.js`), precached)).toBe("file");
  });

  it("leaves everything else to the network", () => {
    expect(routeRequest(get(`${base}assets/app-newer.js`), precached)).toBe("network");
    expect(routeRequest(get("https://other.example/x.js"), precached)).toBe("network");
    expect(routeRequest({ ...get(base, "navigate"), method: "POST" }, precached)).toBe("network");
  });
});

describe("choosePage", () => {
  const fresh = { ok: true, redirected: false, from: "network" };
  const cached = { ok: true, redirected: false, from: "cache" };

  it("prefers the network, so a new deploy shows straight away", () => {
    expect(choosePage(fresh, cached)).toBe(fresh);
  });

  it("uses the cache with no connection", () => {
    expect(choosePage(null, cached)).toBe(cached);
  });

  it("uses the cache when the server has a problem", () => {
    const down = { ok: false, redirected: false, from: "network" };
    expect(choosePage(down, cached)).toBe(cached);
  });

  it("uses the cache for a redirect, which a navigation cannot accept", () => {
    expect(choosePage({ ...fresh, redirected: true }, cached)).toBe(cached);
  });

  it("passes on what it has when nothing is cached yet", () => {
    const missing = { ok: false, redirected: false, from: "network" };
    expect(choosePage(missing, undefined)).toBe(missing);
    expect(choosePage(null, undefined)).toBeNull();
  });
});

describe("stampBuild", () => {
  const build = { version: "abc", files: ['it"s.js', "a$&b.js"] };

  it("writes a build that parses back exactly, whatever the quotes", () => {
    for (const quote of ['"', "'", "`"]) {
      const code = stampBuild(`const b=JSON.parse(${quote}${BUILD_PLACEHOLDER}${quote});`, build);
      const literal = /JSON\.parse\((.*)\);$/.exec(code)?.[1] ?? "";
      expect(JSON.parse(JSON.parse(literal))).toEqual(build);
    }
  });

  it("fails the build rather than ship a worker with no file list", () => {
    expect(() => stampBuild("const b = 1;", build)).toThrow(/placeholder/);
  });
});

describe("withTimeout", () => {
  it("passes a result through", async () => {
    await expect(withTimeout(Promise.resolve(1), 50)).resolves.toBe(1);
  });

  it("passes a failure through", async () => {
    await expect(withTimeout(Promise.reject(new Error("offline")), 50)).rejects.toThrow("offline");
  });

  it("gives up on work that never finishes", async () => {
    await expect(withTimeout(new Promise(() => {}), 5)).rejects.toThrow(/Timed out/);
  });
});
