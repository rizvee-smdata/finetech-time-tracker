/* Offline-first service worker: app shell precache + stale-while-revalidate for static assets.
   API and auth traffic always goes to the network — queued writes are handled in IndexedDB by the app. */
const CACHE = "lavisho-shell-v2";
const SHELL = ["/", "/manifest.json", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_serverFn")) return;

  const isNavigation = req.mode === "navigate";

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);

      // Pages: always network-first so users never see a stale or wrong page.
      // The cached shell is only a last resort when the device is offline.
      if (isNavigation) {
        try {
          const res = await fetch(req);
          if (res && res.status === 200 && res.type === "basic") void cache.put("/", res.clone());
          return res;
        } catch {
          const shell = (await cache.match(req)) || (await cache.match("/"));
          if (shell) return shell;
          return new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
        }
      }

      // Static assets: stale-while-revalidate.
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === "basic") void cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);

      if (cached) {
        void network;
        return cached;
      }
      const res = await network;
      if (res) return res;
      return new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
    })(),
  );
});
