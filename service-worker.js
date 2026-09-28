const CACHE_NAME = 'huarmey-pwa-v1';
const ASSETS = [
  './index.html',
  './manifest.json',
  './logo.png'
];

// Instalación del Service Worker con manejo individual de errores en precache
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const asset of ASSETS) {
        try {
          await cache.add(asset);
        } catch (err) {
          console.warn(`[SW] Advertencia: No se pudo precachear ${asset}:`, err);
        }
      }
      return self.skipWaiting();
    })
  );
});

// Activación y limpieza de cachés antiguos
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Estrategia Cache-First sin interceptar llamadas a Apps Script
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // REGLA CRÍTICA: NUNCA interceptar ni cachear llamadas a Apps Script de Google
  if (url.hostname.includes('script.google.com') || url.hostname.includes('script.googleusercontent.com')) {
    return; // Permite paso directo a la red sin ser gestionado por el SW
  }

  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(e.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(e.request, responseToCache);
        });
        return networkResponse;
      }).catch(() => {
        if (e.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});

// Actualización activa mediante mensaje
self.addEventListener('message', (event) => {
  if (event.data && event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});
