// Little Bit Admin — Service Worker
// Strategy mirrors storefront sw.js, with these admin-specific concerns:
//   HTML → NEVER cached (prevents stale auth state — critical for admin)
//   Firebase Auth API → network only (token refresh must never be cached)
//   Firestore → network only (live data)
//   Firebase SDK + Google Fonts → cache-first (versioned/stable)
//   Static assets → stale-while-revalidate

const CACHE_VERSION = 'lbb-admin-v3-2026-05-11';
const STATIC_CACHE = `${CACHE_VERSION}-static`;

const FIREBASE_SCRIPTS = [
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache =>
      Promise.allSettled(FIREBASE_SCRIPTS.map(url => cache.add(url).catch(() => {})))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== STATIC_CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // HTML / navigation → NEVER cache. Stale HTML in an auth-gated admin = wrong auth state.
  if (event.request.mode === 'navigate' ||
      event.request.destination === 'document' ||
      url.pathname.endsWith('.html') ||
      url.pathname.endsWith('/')) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(
          '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>LBB Admin — Offline</title></head>' +
          '<body style="font-family:Georgia,serif;padding:40px;text-align:center;background:#F6F2E8;color:#0C0C0A;">' +
          '<h1>LBB Admin</h1><p>Offline. Reconnect to continue.</p></body></html>',
          { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 503 }
        )
      )
    );
    return;
  }

  // Firestore / Firebase Auth / Identity Toolkit → network only
  if (url.hostname.includes('firestore.googleapis.com') ||
      url.hostname.includes('firebaseio.com') ||
      url.hostname.includes('firebase.googleapis.com') ||
      url.hostname.includes('identitytoolkit.googleapis.com') ||
      url.hostname.includes('securetoken.googleapis.com') ||
      url.hostname.includes('firebaseinstallations.googleapis.com')) {
    return;
  }

  // Firebase compat SDK → cache-first
  if (url.hostname === 'www.gstatic.com' && url.pathname.includes('firebasejs')) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Google Fonts → cache-first
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Same-origin static assets → stale-while-revalidate
  if (url.origin === self.location.origin) {
    const dest = event.request.destination;
    if (dest === 'style' || dest === 'script' || dest === 'image' ||
        dest === 'font' || dest === 'manifest' ||
        url.pathname.endsWith('.json') || url.pathname.endsWith('.svg')) {
      event.respondWith(staleWhileRevalidate(event.request));
      return;
    }
  }
});

function cacheFirst(request) {
  return caches.match(request).then(cached => {
    if (cached) return cached;
    return fetch(request).then(res => {
      if (res && res.ok && res.type !== 'opaque') {
        const clone = res.clone();
        caches.open(STATIC_CACHE).then(c => c.put(request, clone));
      }
      return res;
    });
  });
}

function staleWhileRevalidate(request) {
  return caches.open(STATIC_CACHE).then(cache =>
    cache.match(request).then(cached => {
      const networkFetch = fetch(request).then(res => {
        if (res && res.ok) cache.put(request, res.clone());
        return res;
      }).catch(() => cached);
      return cached || networkFetch;
    })
  );
}
