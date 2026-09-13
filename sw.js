// =====================================================
//  SERVICE WORKER  —  v2
//
//  The old version was cache-first for everything, which
//  is why updates were always one launch behind.
//
//  Now: the game file is checked against the network
//  FIRST whenever there's a connection, so players get
//  changes as soon as you deploy. The cache is still
//  there as a fallback so it works offline.
//
//  Icons and three.js stay cache-first — they almost
//  never change and they're the big downloads.
// =====================================================
const CACHE_NAME = "nightfall-v2";

const LOCAL_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable.png"
];

const THREE_URL =
  "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";

// which files we always want the freshest copy of
function isFreshFirst(request){
  const url = new URL(request.url);
  if (request.mode === "navigate") return true;
  if (url.origin !== self.location.origin) return false;
  return url.pathname.endsWith("/") ||
         url.pathname.endsWith("index.html") ||
         url.pathname.endsWith("manifest.json");
}

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      await cache.addAll(LOCAL_FILES);
      try {
        const res = await fetch(THREE_URL, { mode: "no-cors" });
        await cache.put(THREE_URL, res);
      } catch (e) {
        console.log("three.js will cache on first play");
      }
    })
  );
  // take over right away instead of waiting for every tab to close
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  // ---- the game file: network first, cache as backup ----
  if (isFreshFirst(event.request)) {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, copy).catch(() => {}));
          return res;
        })
        .catch(() =>
          caches.match(event.request).then(hit => hit || caches.match("./index.html"))
        )
    );
    return;
  }

  // ---- everything else: cache first ----
  event.respondWith(
    caches.match(event.request).then(hit => {
      if (hit) return hit;
      return fetch(event.request)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, copy).catch(() => {}));
          return res;
        })
        .catch(() => caches.match("./index.html"));
    })
  );
});

// lets the page say "activate the new version now"
self.addEventListener("message", event => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
