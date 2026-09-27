// Network-first: perubahan kode langsung terlihat saat online, cache dipakai saat offline.
// GitHub Pages mengirim max-age=600, jadi cache HTTP browser dilewati ('no-cache' = selalu cek ke server,
// dijawab 304 kalau tidak berubah). Tanpa ini, versi lama bisa bertahan hingga 10 menit setelah deploy.
const CACHE = 'daily-v5';
const ASSETS = ['./', 'index.html', 'style.css', 'app.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache =>
    cache.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' })))));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  // Data sinkron (GitHub API) tidak boleh di-cache: berisi token & data pribadi, dan harus selalu segar.
  const url = new URL(event.request.url);
  if (url.hostname === 'api.github.com') return;
  // Request navigasi tidak bisa diberi opsi, jadi file milik sendiri diambil ulang lewat URL-nya.
  const request = url.origin === self.location.origin ? fetch(url.href, { cache: 'no-cache' }) : fetch(event.request);
  event.respondWith(
    request
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
