// Service worker for offline use. The build (vite.config.ts) prepends PRECACHE (every app file,
// relative to this worker's scope) and VERSION (a hash of that list), so each deploy installs a
// fresh cache and drops the old one.
/* global PRECACHE, VERSION */

const CACHE = `dag-${VERSION}`;
// Files fetched on demand (the Noto subsets for non-Latin character sets), kept across versions.
const RUNTIME = 'dag-runtime';
const scoped = (path) => new URL(path, self.registration.scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE.map(scoped))));
  // Take over as soon as installed; pages pick up new files on their next load.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('dag-') && k !== CACHE && k !== RUNTIME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // The page: network first so a new deploy shows up when online, the cached copy when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(scoped('./'), copy));
          }
          return res;
        })
        .catch(() => caches.match(scoped('./'))),
    );
    return;
  }

  // Everything else has a hashed name: cache first, and keep what was fetched on demand.
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && url.pathname.includes('/assets/')) {
            const copy = res.clone();
            caches.open(RUNTIME).then((cache) => cache.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
