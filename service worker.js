const CACHE = 'huarmey-v3';
const ASSETS = ['./', './index.html', './manifest.json', './icons/icon-192.png', './icons/icon-512.png', './icons/logo.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  // Apps Script y otros orígenes: la app maneja su propio caché (IndexedDB)
  if (url.origin !== location.origin) {
    if (url.hostname === 'cdn.tailwindcss.com') {
      e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); return res; })));
    }
    return;
  }
  // Network First para el HTML, Cache First para el resto
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(res => { const cp = res.clone(); caches.open(CACHE).then(c => c.put('./index.html', cp)); return res; }).catch(() => caches.match('./index.html')));
  } else {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); return res; })));
  }
});
// Sincronización en segundo plano
self.addEventListener('sync', e => {
  if (e.tag === 'sync-registros') {
    e.waitUntil(self.clients.matchAll().then(cs => cs.forEach(c => c.postMessage({ type: 'SYNC' }))));
  }
});
