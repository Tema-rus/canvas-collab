const CACHE = 'draw-v2';  // НОВЫЙ КЭШ
const urlsToCache = ['/', '/index.html', '/app.js', '/manifest.json'];

self.addEventListener('install', e => {
    self.skipWaiting();  // Активируем сразу
    e.waitUntil(
        caches.open(CACHE)
            .then(cache => cache.addAll(urlsToCache))
    );
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.filter(key => key !== CACHE)
                    .map(key => caches.delete(key))
            )
        )
    );
});

self.addEventListener('fetch', e => {
    e.respondWith(
        caches.match(e.request).then(response =>
            response || fetch(e.request)
        )
    );
});
