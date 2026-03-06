/* Kinetic — Service Worker (PWA)
   Caches the app shell for offline use.
   Network-first for API calls; cache-first for static assets.
*/

const CACHE_NAME = 'kinetic-v1';
const STATIC_ASSETS = [
  '/',
  '/dashboard',
  '/pricing',
  '/login',
  '/manifest.json',
];

// ── Install: pre-cache shell ──────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// ── Activate: delete old caches ───────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch: network-first for /api, cache-first for assets ────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Always network for API calls
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(JSON.stringify({ error: 'offline', message: 'You are offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    return;
  }

  // Cache-first for static assets
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response.status === 200 && request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});

// ── Push notifications ────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  const title = data.title || 'Kinetic Alert';
  const options = {
    body: data.body || 'An agent event occurred',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    tag: data.tag || 'kinetic-event',
    data: data.url ? { url: data.url } : {},
    actions: [
      { action: 'view', title: 'View Dashboard' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'view' || !event.action) {
    event.waitUntil(clients.openWindow('/dashboard'));
  }
});
