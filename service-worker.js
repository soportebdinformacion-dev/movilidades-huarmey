const CACHE_NAME = 'huarmey-v2';
const ASSETS_TO_CACHE = [
  './',
  './Index.html',
  './manifest.json',
  './ICONO HUARMEY.png',
  'https://unpkg.com/dexie@3.2.0/dist/dexie.min.js'
];

// Instalación
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

// Activación
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    })
  );
  self.clients.claim();
});

// Intercepción de peticiones (ESTA ES LA CLAVE)
self.addEventListener('fetch', (e) => {
  // Si la petición es hacia Google Apps Script (API), ir SIEMPRE a la red (sin pasar por caché)
  if (e.request.url.includes('script.google.com')) {
    e.respondWith(fetch(e.request));
    return;
  }

  // Para el resto de archivos (HTML, imágenes, JS), usar caché local con fallback a la red
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      return cachedResponse || fetch(e.request);
    })
  );
});
