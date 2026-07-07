const CACHE = "spend-hub-v1";
const PRECACHE = ["/", "/src/client/styles/tokens.css", "/src/client/styles/base.css", "/src/client/styles/layout.css", "/src/client/styles/components.css", "/src/client/styles/pages.css"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  // API and payment state are always network-only: never serve stale money data.
  if (url.pathname.startsWith("/api/")) return;
  // Static assets: network-first with cache fallback so updates land immediately
  // but the shell still opens offline.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request, { ignoreSearch: url.pathname === "/" }).then((cached) => cached || caches.match("/"))),
  );
});
