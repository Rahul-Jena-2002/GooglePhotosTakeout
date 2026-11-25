/**
 * TakeoutFix Service Worker v3 — Native-app-like offline + cache experience
 *
 * Strategies:
 *  - Public HTML pages:          NetworkFirst — latest content, with offline fallback
 *  - Static assets (_astro/):    CacheFirst — immutable hashed chunks
 *  - Google Fonts:               CacheFirst — long TTL
 *  - Account pages, APIs, and external services: NetworkOnly
 *  - Other same-origin requests: NetworkFirst with cache fallback
 *
 * Extras:
 *  - Background Sync: flushes pending Firestore usage on reconnect
 *  - Push notifications: admin alerts, invite notifications
 */

const CACHE_NAME   = 'takeoutfix-v9';
const STATIC_CACHE = 'takeoutfix-static-v9';
const FONT_CACHE   = 'takeoutfix-fonts-v9';

const APP_SHELL = [
  '/',
  '/favicon.ico',
  '/favicon.svg',
  '/favicon-192x192.png',
  '/favicon-512x512.png',
  '/manifest.webmanifest',
];

const PRIVATE_PATHS = ['/api', '/admin', '/dashboard', '/profile', '/auth', '/login', '/signup', '/user/dashboard', '/user/profile'];

// ─── Localhost Killswitch & Self-Cleanup ────────────────────────────────────
// In local development, service workers cache old Vite dependency chunks with stale ?v= hashes,
// causing duplicate React instances ("Cannot read properties of null reading useState") and navigation breakage.
const isLocalhost = self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1';

if (isLocalhost) {
  self.addEventListener('install', () => self.skipWaiting());
  self.addEventListener('activate', (event) => {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.filter(k => k.startsWith('takeoutfix-')).map(k => caches.delete(k))))
        .then(() => self.registration.unregister())
        .then(() => self.clients.claim())
    );
  });
} else {
  // ─── Install ──────────────────────────────────────────────────────────────────
  self.addEventListener('install', (event) => {
    event.waitUntil(
      caches.open(CACHE_NAME)
        .then(cache => cache.addAll(APP_SHELL.map(u => new Request(u, { credentials: 'same-origin' })))
          .catch(() => {}))
        .then(() => self.skipWaiting())
    );
  });

  // ─── Activate ────────────────────────────────────────────────────────────────
  self.addEventListener('activate', (event) => {
    const valid = [CACHE_NAME, STATIC_CACHE, FONT_CACHE];
    event.waitUntil(
      caches.keys()
        .then(keys => Promise.all(keys.filter(k => k.startsWith('takeoutfix-') && !valid.includes(k)).map(k => caches.delete(k))))
        .then(() => self.clients.claim())
    );
  });
  // ─── Fetch (Production Only) ────────────────────────────────────────────────
  self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    // Google Fonts — cache-first, long TTL
    if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
      event.respondWith(cacheFirst(request, FONT_CACHE));
      return;
    }

    // Do not persist personalized pages, API responses, or third-party data.
    const pathname = url.pathname.replace(/\.html$/i, '');
    if (url.origin !== self.location.origin || PRIVATE_PATHS.some(path =>
      pathname === path || pathname.startsWith(path + '/')
    )) return;

    // Astro's generated asset names are content-hashed. Public files retain
    // their names across releases and must be revalidated instead.
    if (url.pathname.startsWith('/_astro/')) {
      event.respondWith(cacheFirst(request, STATIC_CACHE));
      return;
    }

    // HTML pages — network-first (always get latest deployed build, fallback to cache if offline)
    if (request.headers.get('accept')?.includes('text/html') && url.origin === self.location.origin) {
      event.respondWith(networkFirst(request, CACHE_NAME));
      return;
    }

    // Everything else — network-first with cache fallback
    event.respondWith(networkFirst(request, CACHE_NAME));
  });
}

// ─── Strategies ───────────────────────────────────────────────────────────────

async function cacheFirst(request, cacheName) {
  let cache;
  try {
    cache = await caches.open(cacheName);
    const hit = await cache.match(request);
    if (hit) return hit;
  } catch (error) {
    console.warn('Could not read the offline cache:', error);
  }
  try {
    const res = await fetch(request);
    if (res.ok && cache && canStore(res)) void cache.put(request, res.clone()).catch(error => console.warn('Could not update the offline cache:', error));
    return res;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const freshPromise = fetch(request).then(res => {
    if (res.ok && canStore(res)) void cache.put(request, res.clone()).catch(error => console.warn('Could not update the offline cache:', error));
    return res;
  }).catch(() => null);
  return hit || await freshPromise || offlinePage();
}

async function networkFirst(request, cacheName) {
  try {
    const res = await fetch(request);
    if (res.ok && canStore(res)) {
      const copy = res.clone();
      void caches.open(cacheName).then(cache => cache.put(request, copy)).catch(error => console.warn('Could not update the offline cache:', error));
    } else if (!canStore(res)) {
      await caches.open(cacheName).then(cache => cache.delete(request)).catch(error => console.warn('Could not remove the offline cache entry:', error));
    }
    return res;
  } catch {
    try {
      const cache = await caches.open(cacheName);
      const hit = await cache.match(request);
      if (hit) return hit;
    } catch (error) {
      console.warn('Could not read the offline cache:', error);
    }
    return request.headers.get('accept')?.includes('text/html') ? offlinePage() : new Response('Offline', { status: 503 });
  }
}

function canStore(response) {
  return !/(?:^|,)\s*(?:private|no-store)\b/i.test(response.headers.get('cache-control') || '');
}

function offlinePage() {
  return new Response(
    `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>TakeoutFix — Offline</title>
    <style>*{box-sizing:border-box}body{margin:0;background:#09090b;color:#fff;font-family:system-ui,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;text-align:center;padding:2rem}
    h1{font-size:1.5rem;margin:0 0 .5rem}p{color:#71717a;margin:0}.badge{display:inline-block;background:#1c1c1f;border:1px solid #27272a;border-radius:9999px;padding:.25rem .75rem;font-size:.75rem;color:#a1a1aa;margin-top:1rem}</style>
    </head><body><div><h1>You're offline</h1>
    <p>Reconnect to load TakeoutFix and sync your account. Restoration runs on your device, but the tool may need a connection to load its components.</p>
    <div class="badge">TakeoutFix PWA</div></div></body></html>`,
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

// ─── Background Sync — flush pending usage on reconnect ─────────────────────

self.addEventListener('sync', (event) => {
  if (event.tag === 'flush-usage') {
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then(clients => {
        for (const c of clients) c.postMessage({ type: 'SW_FLUSH_USAGE' });
      })
    );
  }
});

// ─── Push Notifications ───────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  const data = event.data?.json?.() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'TakeoutFix', {
      body:  data.body  || '',
      icon:  '/favicon-192x192.png',
      badge: '/favicon-192x192.png',
      tag:   data.tag   || 'takeoutfix',
      data:  { url: data.url || '/tool' }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/tool';
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(clients => {
      for (const c of clients) {
        if (c.url.includes(self.location.origin) && 'focus' in c) return c.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
