/* LakeLens service worker: network-first with an /offline fallback for page loads.
 * Registered only in production (components/pwa/RegisterSW.tsx) and served with
 * Cache-Control: no-cache (next.config.ts). Bump CACHE to drop old entries. */
const CACHE = "lakelens-v1";
const OFFLINE_URL = "/offline";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/icons/icon-512.png", "/icons/logo.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url))))
      .catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function putInCache(request, response) {
  const copy = response.clone();
  caches
    .open(CACHE)
    .then((cache) => cache.put(request, copy))
    .catch(() => {});
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // never touch Supabase / tiles / weather
  if (url.pathname.startsWith("/api/")) return; // live data is never cached

  // Hashed build assets are immutable: cache-first.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok) putInCache(request, res);
            return res;
          }),
      ),
    );
    return;
  }

  // Everything else: network-first, fall back to cache, then to /offline for navigations.
  event.respondWith(
    fetch(request)
      .then((res) => {
        const cacheable =
          res.ok &&
          (request.mode === "navigate" ||
            url.pathname.startsWith("/icons/") ||
            url.pathname.startsWith("/photos/") ||
            url.pathname === "/manifest.webmanifest");
        if (cacheable) putInCache(request, res);
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(request);
        if (hit) return hit;
        if (request.mode === "navigate") {
          const offline = await caches.match(OFFLINE_URL);
          if (offline) return offline;
        }
        return Response.error();
      }),
  );
});
