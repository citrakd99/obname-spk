// Service worker: app shell tersedia offline. Panggilan API (lintas-origin POST) tidak disentuh.
// Naikkan VERSION setiap kali file aplikasi berubah agar perangkat mengambil versi baru.
const VERSION = 'obname-v1';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'logic.js', 'config.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.endsWith('/exec')) return;
  // jaringan dulu (agar update cepat terlihat), cadangan dari cache saat offline
  e.respondWith(fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req).then(r => r || caches.match('index.html'))));
});
