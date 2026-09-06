const CACHE_NAME = 'ompchamber-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // A simple fetch handler is required by Chromium for PWA installability.
  // We'll just let network requests pass through normally.
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
