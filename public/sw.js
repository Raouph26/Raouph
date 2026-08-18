/*
 * Service worker.
 *
 * PWABuilder requires one before it will package the app, and the game is a
 * genuinely good fit for offline: every level is generated on the device from
 * its id, so once the shell is cached there is nothing left to fetch. The whole
 * game works on a plane.
 *
 * Strategy is cache-first with a background refresh. The build emits hashed
 * filenames, so a stale asset can never be served under a new name; bumping
 * CACHE clears the previous generation on activate.
 */
const CACHE = "thrum-v1";
const SHELL = ["./", "./index.html", "./manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      // A missing shell entry must not wedge the install; the fetch handler
      // fills the cache lazily anyway.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === "basic") {
            const copy = response.clone();
            void caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);

      // Cached first so the game starts instantly; the network copy refreshes
      // the cache for next time.
      return cached || network;
    }),
  );
});
