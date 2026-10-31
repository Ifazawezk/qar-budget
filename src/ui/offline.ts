/**
 * Whether the page on screen is the build the service worker holds. Opening the app
 * online already shows the newest build, and then there is nothing to offer.
 */
async function isCurrentBuild(): Promise<boolean> {
  const script = document.querySelector<HTMLScriptElement>('script[type="module"][src]');
  return !script || (await caches.match(script.src)) !== undefined;
}

function whenActivated(worker: ServiceWorker): Promise<void> {
  return new Promise((resolve) => {
    if (worker.state === "activated") return resolve();
    worker.addEventListener("statechange", () => {
      if (worker.state === "activated") resolve();
    });
  });
}

/** Set up offline use. `onUpdate` runs when a new build arrives while an old one is on screen. */
export function registerOffline(onUpdate: () => void): void {
  // Not during development, where a cached app would hide every change.
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  const { serviceWorker } = navigator;
  const base = import.meta.env.BASE_URL;

  // The very first install also changes the controller, and that is not an update.
  let controlled = serviceWorker.controller !== null;
  serviceWorker.addEventListener("controllerchange", () => {
    const wasControlled = controlled;
    const worker = serviceWorker.controller;
    controlled = true;
    if (!wasControlled || !worker) return;
    // The controller changes before the new worker has removed the old cache, and until
    // then an old page still finds its own script and would look up to date.
    void whenActivated(worker)
      .then(isCurrentBuild)
      .then((current) => {
        if (!current) onUpdate();
      });
  });

  // updateViaCache "none": the HTTP cache must never hide a new sw.js.
  serviceWorker
    .register(`${base}sw.js`, { scope: base, updateViaCache: "none" })
    .then((registration) => {
      // A phone resumes an installed app instead of reloading it, so check on the way back too.
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") registration.update().catch(() => {});
      });
    })
    .catch(() => {
      // Private windows and plain http refuse service workers. The app works without one.
    });
}
