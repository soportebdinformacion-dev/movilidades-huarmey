// Service worker: shell offline (cache-first). Nunca intercepta llamadas a Google.
const CACHE_VERSION = 'v3';
const CACHE_NAME = 'huarmey-shell-' + CACHE_VERSION;
const PRECACHE = ['./', './index.html', './manifest.json', './logo.png', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Cada archivo por separado: si uno falla, los demás igual se guardan
    await Promise.all(PRECACHE.map(async (url) => {
      try { await cache.add(url); } catch (err) { console.warn('[SW] No se pudo precachear', url, err); }
    }));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('huarmey-shell-') && k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.endsWith('script.google.com') || url.hostname.endsWith('googleusercontent.com')) return; // directo a la red
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    // Páginas HTML: red primero (así las correcciones llegan de inmediato); si no hay red, usa la copia guardada
    if (req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('/')) {
      try {
        const res = await fetch(req, { cache: 'no-store' });
        if (res && res.ok) { const copy = res.clone(); caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => {}); }
        return res;
      } catch (err) {
        const c = (await caches.match(req, { ignoreSearch: true })) || (await caches.match('./index.html'));
        return c || new Response('Sin conexión', { status: 503, statusText: 'Offline' });
      }
    }
    // Resto (iconos, manifest): caché primero
    const cached = await caches.match(req, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => {});
      }
      return res;
    } catch (err) {
      return new Response('Sin conexión', { status: 503, statusText: 'Offline' });
    }
  })());
});
