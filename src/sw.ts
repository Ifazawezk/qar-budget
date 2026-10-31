/// <reference lib="webworker" />

import {
  BUILD_PLACEHOLDER,
  cacheName,
  choosePage,
  NAVIGATION_TIMEOUT_MS,
  routeRequest,
  staleCaches,
  type SwBuild,
  withTimeout,
} from "./lib/sw-rules";

declare const self: ServiceWorkerGlobalScope;

// The build replaces the placeholder with its own version and file list. Any change
// to any file changes this script, and that is how the browser notices a new deploy.
const build = JSON.parse(BUILD_PLACEHOLDER) as SwBuild;

const cache = cacheName(build.version);
const urlOf = (file: string) => new URL(file, self.registration.scope).href;
const precached = new Set(build.files.map(urlOf));
const page = urlOf("index.html");
const matching = { cacheName: cache, ignoreVary: true };

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const files = await caches.open(cache);
      // "reload" skips the browser's HTTP cache. GitHub Pages lets files be cached for ten
      // minutes, so without it an old index.html could be stored beside new assets. addAll
      // keeps nothing if one file fails, so the version in use stays whole.
      await files.addAll([...precached].map((url) => new Request(url, { cache: "reload" })));
      // Taking over at once is safe: pages have all their code loaded and fetch no more of it.
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const stale = staleCaches(await caches.keys(), cache);
      await Promise.all(stale.map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

async function openPage(url: string): Promise<Response> {
  // "no-cache" asks the server every time, so the HTTP cache cannot serve an old page. The
  // result is never stored: only an install writes to the cache, so the page and the
  // assets it names always come from the same build.
  const network = await withTimeout(fetch(url, { cache: "no-cache" }), NAVIGATION_TIMEOUT_MS).catch(
    () => null,
  );
  const cached = await caches.match(page, matching);
  return choosePage(network, cached) ?? Response.error();
}

async function openFile(request: Request): Promise<Response> {
  return (await caches.match(request, matching)) ?? fetch(request);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const route = routeRequest(request, precached);
  if (route === "page") event.respondWith(openPage(request.url));
  else if (route === "file") event.respondWith(openFile(request));
});
