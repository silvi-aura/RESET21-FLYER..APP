/* RESET 21 (canal Flyer) — service worker
   HTML: red primero (así los cambios llegan al celular).
   Resto: cache primero + actualización en segundo plano.
   Firebase (validación del código) nunca pasa por el cache. */
const PREFIJO = 'reset21-flyer-';
const VERSION = PREFIJO + 'v2.1.0';
const CORE = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/icon-180.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSION)
      .then(c => Promise.allSettled(CORE.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      // Solo borra versiones viejas de ESTA app (no toca la app principal de RESET 21)
      .then(ks => Promise.all(ks.filter(k => k.startsWith(PREFIJO) && k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Firestore y otros servicios de Google: siempre directo a internet
  if (url.hostname.endsWith('googleapis.com') && url.hostname !== 'fonts.googleapis.com') return;

  const esHTML = req.mode === 'navigate' ||
                 (req.headers.get('accept') || '').includes('text/html');

  // 1) HTML → red primero, cache de respaldo
  if (esHTML && url.origin === self.location.origin) {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copia = res.clone();
          caches.open(VERSION).then(c => c.put('./index.html', copia));
          return res;
        })
        .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // 2) Tipografías de Google y librerías de Firebase → cache primero, se actualiza atrás
  const externo = url.hostname === 'fonts.googleapis.com' ||
                  url.hostname === 'fonts.gstatic.com' ||
                  (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/'));

  // 3) Todo lo demás del mismo origen + lo de arriba → cache primero
  if (url.origin === self.location.origin || externo) {
    e.respondWith(
      caches.match(req).then(cacheado => {
        const red = fetch(req).then(res => {
          if (res && (res.status === 200 || res.type === 'opaque')) {
            const copia = res.clone();
            caches.open(VERSION).then(c => c.put(req, copia));
          }
          return res;
        }).catch(() => cacheado);
        return cacheado || red;
      })
    );
  }
});
