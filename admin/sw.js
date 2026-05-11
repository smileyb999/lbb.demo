// Little Bit Admin — Service Worker
// Strategy:
//   Static assets (HTML, manifest) → Cache First, update in background
//   Firebase SDK scripts → Cache First (versioned URLs, safe to cache)
//   Firestore / Firebase Auth API calls → Network only (always want live data)
//   Everything else → Network First, fall back to cache

const CACHE_NAME = 'lbb-admin-v1';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
];

const FIREBASE_SCRIPTS = [
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled([
        ...STATIC_ASSETS.map(url => cache.add(url).catch(() => {})),
        ...FIREBASE_SCRIPTS.map(url => cache.add(url).catch(() => {})),
      ])
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Firestore / Firebase Auth → always network, never cache
  if (url.hostname.includes('firestore.googleapis.com') ||
      url.hostname.includes('firebase.googleapis.com') ||
      url.hostname.includes('identitytoolkit.googleapis.com') ||
      url.pathname.includes('/firestore/') ||
      url.pathname.includes('/google.firestore.')) {
    return;
  }

  // Firebase compat SDK → cache first
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
});
