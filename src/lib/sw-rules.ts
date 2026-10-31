// The decisions the service worker makes, kept apart from its browser events so they
// can be tested. Only src/sw.ts and the build use this file: a module shared with the
// app would be split into its own chunk, and a service worker cannot import one.

/** github.io serves all of a user's project sites from one origin, and caches are per origin. */
export const CACHE_PREFIX = "qar-budget-";

/** How long opening the app waits for the network on a weak connection before using the cache. */
export const NAVIGATION_TIMEOUT_MS = 4000;

export const BUILD_PLACEHOLDER = "__SW_BUILD__";

/** What each build writes into sw.js. */
export interface SwBuild {
  version: string;
  /** Paths relative to the service worker, such as "assets/index-abc.js". */
  files: string[];
}

export function cacheName(version: string): string {
  return `${CACHE_PREFIX}${version}`;
}

/** Older versions of this app's cache. Caches from other sites on the origin are left alone. */
export function staleCaches(names: readonly string[], current: string): string[] {
  return names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== current);
}

/** The files of a finished build that are needed to open it offline. */
export function precacheFiles(files: readonly string[]): string[] {
  return files.filter((file) => file !== "sw.js" && !file.endsWith(".map")).sort();
}

/** Put a build's version and file list into the bundled service worker. */
export function stampBuild(code: string, build: SwBuild): string {
  const placeholder = new RegExp(`(["'\`])${BUILD_PLACEHOLDER}\\1`);
  if (!placeholder.test(code)) throw new Error("The service worker has no build placeholder");
  return code.replace(placeholder, () => JSON.stringify(JSON.stringify(build)));
}

export type Route = "page" | "file" | "network";

export interface RouteInput {
  url: string;
  method: string;
  mode: string;
}

/**
 * - "page": opening the app. Network first, so a new deploy shows as soon as it is reachable.
 * - "file": a file of this build. Its name holds a hash of its content, so it never goes stale.
 * - "network": anything else is not this worker's business.
 */
export function routeRequest(request: RouteInput, precached: ReadonlySet<string>): Route {
  if (request.method !== "GET") return "network";
  if (request.mode === "navigate") return "page";
  return precached.has(request.url) ? "file" : "network";
}

interface PageResponse {
  ok: boolean;
  redirected: boolean;
}

/**
 * Which response opens the app. The network's, unless it failed or errored. A redirected
 * response is not used because browsers refuse one for a navigation.
 */
export function choosePage<T extends PageResponse>(network: T | null, cached: T | undefined): T | null {
  if (network?.ok && !network.redirected) return network;
  return cached ?? network;
}

export function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out after ${ms} ms`)), ms);
    work.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}
