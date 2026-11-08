/*
 * Service worker: makes the app shell installable and quick to open.
 * It handles ONLY same-origin GET requests. Everything else - blockchain RPC (POST), image uploads, remote images,
 * signatures, keys - never passes through the cache. Blog data always comes live from the chain.
 *   - page navigations: network first, cached shell as the offline fallback
 *   - hashed /assets/*: cache first (file names change with every build)
 *   - locales, icons, vendor files: stale-while-revalidate
 * Bump VERSION to drop old caches.
 */
const VERSION = 'v2';
const CACHE = `blurtdiary-${VERSION}`;
const SHELL = new URL('./', self.location).href;

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([SHELL, new URL('./manifest.webmanifest', self.location).href]).catch(() => undefined)));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('blurtdiary-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request; const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // RPC, uploads, remote images: untouched
  if (url.pathname.endsWith('/feed-frame.html')) return; // the sandboxed feed fetcher is a navigation too, but must never replace the cached app shell

  if (req.mode === 'navigate') { // ?user=…&post=… all share one cached shell
    e.respondWith(fetch(req).then((r) => { const copy = r.clone(); void caches.open(CACHE).then((c) => c.put(SHELL, copy)); return r; })
      .catch(() => caches.match(SHELL).then((r) => r ?? Response.error())));
    return;
  }
  if (url.pathname.includes('/assets/')) { // immutable, content-hashed
    e.respondWith(caches.match(req).then((hit) => hit ?? fetch(req).then((r) => { if (r.ok) { const copy = r.clone(); void caches.open(CACHE).then((c) => c.put(req, copy)); } return r; })));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => {
    const net = fetch(req).then((r) => { if (r.ok) { const copy = r.clone(); void caches.open(CACHE).then((c) => c.put(req, copy)); } return r; }).catch(() => hit ?? Response.error());
    return hit ?? net;
  }));
});
