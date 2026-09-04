// Evangelism Tracker - Service Worker
// Keep this simple during local development so stale app code does not
// stick around and break the UI on repeated testing.
const CACHE_NAME = 'evangelism-tracker-v5';
const STATIC_ASSETS = [
  '',
  'index.html',
  'app.js',
  'supabase.js',
  'style.css',
  'manifest.json',
  'icons/trackerlogo.png',
];

const appUrl = (path) => new URL(path, self.registration.scope).toString();

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS.map(appUrl)))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.url.includes('supabase.co')) {
    event.respondWith(fetch(request).catch(() => caches.match(request)));
    return;
  }

  if (request.method !== 'GET') return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && request.url.startsWith(self.location.origin)) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => {
        return caches.match(request).then((cached) => {
          return cached || (request.mode === 'navigate' ? caches.match(appUrl('index.html')) : undefined);
        });
      })
  );
});
