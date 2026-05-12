// Little Bit Bakery Storefront — Service Worker
// Strategy:
//   HTML (./, ./index.html) → NEVER cached (always fresh, prevents stale drop status)
//   Firebase SDK scripts from gstatic.com → cache-first (versioned URLs, safe)
//   Google Fonts → cache-first
//   Firestore / Auth API calls → network-only (live data, never cache)
//   Static assets (CSS, JS, images, icons, manifest) → cache-first w/ background revalidate
//   Everything else → network only (don't interfere)

const CACHE_VERSION = 'lbb-storefront-v3-2026-05-11';
const STATIC_CACHE = `${CACHE_VERSION}-static`;

// Firebase CDN scripts — stable versioned URLs, precache for offline
const FIREBASE_SCRIPTS = [
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js',
];

// ── INSTALL ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      // Don't fail install if a Firebase CDN URL is briefly unreachable
      return Promise.allSettled(
        FIREBASE_SCRIPTS.map(url => cache.add(url).catch(() => {}))
      );
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE — clear ALL old caches ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== STATIC_CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── FETCH ──
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // HTML navigation requests → NEVER cache. Always network, fall back to a minimal offline message.
  // This prevents stale storefront from showing wrong drop status on Saturday morning.
  if (event.request.mode === 'navigate' ||
      (event.request.destination === 'document') ||
      url.pathname.endsWith('.html') ||
      url.pathname.endsWith('/')) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(
          '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Little Bit Bakery — Offline</title></head>' +
          '<body style="font-family:Georgia,serif;padding:40px;text-align:center;background:#F6F2E8;color:#0C0C0A;">' +
          '<h1>Little Bit Bakery</h1><p>You appear to be offline. Reconnect to see the latest drop.</p>' +
          '</body></html>',
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
      url.hostname.includes('firebaseinstallations.googleapis.com') ||
      url.hostname.includes('firebaseremoteconfig.googleapis.com')) {
    return; // Browser handles
  }

  // Firebase compat SDK scripts from gstatic → cache-first (versioned URLs)
  if (url.hostname === 'www.gstatic.com' && url.pathname.includes('firebasejs')) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Google Fonts → cache-first
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Same-origin static assets (CSS, JS, images, icons, manifest, SVG)
  // Cache-first with background revalidate (stale-while-revalidate pattern)
  if (url.origin === self.location.origin) {
    const dest = event.request.destination;
    if (dest === 'style' || dest === 'script' || dest === 'image' ||
        dest === 'font' || dest === 'manifest' ||
        url.pathname.endsWith('.json') || url.pathname.endsWith('.svg')) {
      event.respondWith(staleWhileRevalidate(event.request));
      return;
    }
  }

  // Default: don't interfere
});

// ── Caching strategies ──
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

// ── PUSH NOTIFICATIONS ──
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
