// Service Worker - caché del app shell. Subir el número de versión al cambiar archivos.
const CACHE='huarmey-v1';
const SHELL=['./','./index.html','./manifest.json','./logo.png','./icon-192.png','./icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(n=>n!==CACHE).map(n=>caches.delete(n)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  const r=e.request,u=new URL(r.url);
  if(r.method!=='GET'||u.origin!==location.origin)return; // nunca interceptar la API de Google
  if(r.mode==='navigate'){
    e.respondWith(fetch(r).then(x=>{const c=x.clone();caches.open(CACHE).then(ch=>ch.put('./index.html',c));return x;}).catch(()=>caches.match('./index.html')));
    return;
  }
  e.respondWith(caches.match(r).then(h=>h||fetch(r).then(x=>{const c=x.clone();caches.open(CACHE).then(ch=>ch.put(r,c));return x;})));
});
