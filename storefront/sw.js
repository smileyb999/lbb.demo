// Little Bit Bakery — Service Worker
// Strategy:
//   Static assets (HTML, manifest, icons) → Cache First, update in background
//   Firebase SDK scripts → Cache First (versioned URLs, safe to cache)
//   Firestore API calls → Network First, no cache (always want live data)
//   Everything else → Network First, fall back to cache

const CACHE_NAME = 'lbb-v1';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
];

// Firebase CDN scripts — stable versioned URLs
const FIREBASE_SCRIPTS = [
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js',
];

// ── INSTALL ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Cache static assets; don't fail install if some are missing
      return Promise.allSettled([
        ...STATIC_ASSETS.map(url => cache.add(url).catch(() => {})),
        ...FIREBASE_SCRIPTS.map(url => cache.add(url).catch(() => {})),
      ]);
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── FETCH ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Firestore / Firebase Auth API calls → always network, never cache
  if (url.hostname.includes('firestore.googleapis.com') ||
      url.hostname.includes('firebase.googleapis.com') ||
      url.hostname.includes('identitytoolkit.googleapis.com') ||
      url.pathname.includes('/firestore/') ||
      url.pathname.includes('/google.firestore.')) {
    return; // Let browser handle normally
  }

  // Firebase compat SDK scripts → cache first
  if (url.hostname === 'www.gstatic.com' && url.pathname.includes('firebasejs')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return res;
        });
      })
    );
    return;
  }

  // Google Fonts → cache first
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return res;
        }).catch(() => cached);
      })
    );
    return;
  }

  // Same-origin requests → network first, fall back to cache
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Default: network only (don't interfere with cross-origin requests)
});

// ── PUSH NOTIFICATIONS (stub — wire to subscribers later) ──
self.addEventListener('push', event => {
  let data = { title: 'Little Bit Bakery', body: 'New drop alert!' };
  try {
    if (event.data) data = event.data.json();
  } catch(e) {
    if (event.data) data.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Little Bit Bakery', {
      body: data.body || 'Check the latest drop!',
      icon: './icon-192.png',
      badge: './icon-192.png',
      tag: 'lbb-drop',
      renotify: true,
      data: { url: data.url || './' },
    })
  );
});

// Open storefront when notification is tapped
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url === target && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(target);
    })
  );
});
