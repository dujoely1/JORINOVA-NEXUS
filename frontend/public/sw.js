/* JORINOVA NEXUS ALIS-X — service worker (offline app shell).
 *
 * - Navigations (HTML): network-first → fall back to cached page → offline.html.
 * - Static assets (/_next/static, images, css, js): stale-while-revalidate.
 * - API (/api/*, /media/*): never cached — data must be live (fails cleanly offline
 *   and the UI keeps its session; see AuthProvider retry).
 * Bump CACHE to invalidate old caches on the next visit.
 */
const CACHE = 'nexus-v2';
const CORE = ['/', '/login', '/dashboard', '/offline.html', '/manifest.webmanifest', '/logo/jorinova-nexus.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(CORE.map((u) => c.add(u)))));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;               // only same-origin
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/media/')) return; // live data

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; })
        .catch(() => caches.match(req).then((r) => r || caches.match('/offline.html')))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((cached) => {
      const fetched = fetch(req)
        .then((res) => { if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return res; })
        .catch(() => cached);
      return cached || fetched;
    })
  );
});
