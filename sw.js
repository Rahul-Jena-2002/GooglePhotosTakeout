/**
 * TakeoutFix Service Worker v3 — Native-app-like offline + cache experience
 *
 * Strategies:
 *  - App shell (HTML pages):     StaleWhileRevalidate — instant load + background refresh
 *  - Static assets (_astro/):    CacheFirst — immutable hashed chunks
 *  - Google Fonts:               CacheFirst — long TTL
 *  - Firebase / Auth / Sentry:   NetworkOnly — always fresh
 *  - Everything else:            NetworkFirst with cache fallback
 *
 * Extras:
 *  - Background Sync: flushes pending Firestore usage on reconnect
 *  - Push notifications: admin alerts, invite notifications
 */

const CACHE_NAME   = 'takeoutfix-v3';
const STATIC_CACHE = 'takeoutfix-static-v3';
const FONT_CACHE   = 'takeoutfix-fonts-v3';

const APP_SHELL = [
  '/',
  '/tool',
  '/pricing',
  '/favicon.ico',
  '/favicon.svg',
  '/favicon-192x192.png',
  '/favicon-512x512.png',
  '/manifest.webmanifest',
];

const NETWORK_ONLY_HOSTS = [
  'firestore.googleapis.com',
  'firebase.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'accounts.google.com',
  'ingest.sentry.io',
];

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
      .then(keys => Promise.all(keys.filter(k => !valid.includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ─── Localhost Killswitch & Self-Cleanup ────────────────────────────────────
// In local development, service workers cache old Vite dependency chunks with stale ?v= hashes,
// causing duplicate React instances ("Cannot read properties of null reading useState") and navigation breakage.
const isLocalhost = self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1';

if (isLocalhost) {
  self.addEventListener('install', () => self.skipWaiting());
  self.addEventListener('activate', (event) => {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
        .then(() => self.registration.unregister())
        .then(() => self.clients.claim())
    );
  });
} else {
  // ─── Fetch (Production Only) ────────────────────────────────────────────────
  self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    // Network-only: Firebase, Auth, Sentry
    if (NETWORK_ONLY_HOSTS.some(h => url.hostname.includes(h))) return;

    // Google Fonts — cache-first, long TTL
    if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
      event.respondWith(cacheFirst(request, FONT_CACHE));
      return;
    }

    // Static immutable assets (Astro hashed chunks, images, icons) — strictly SAME-ORIGIN only!
    // External scripts (e.g. Google AdSense) must NEVER be intercepted by cacheFirst.
    if (
      url.origin === self.location.origin && (
        url.pathname.startsWith('/_astro/') ||
        url.pathname.startsWith('/assets/') ||
        /\.(woff2?|ttf|png|jpg|jpeg|svg|webp|ico|gif|js|css)$/i.test(url.pathname)
      )
    ) {
      event.respondWith(cacheFirst(request, STATIC_CACHE));
      return;
    }

    // HTML pages — stale-while-revalidate
    if (request.headers.get('accept')?.includes('text/html') && url.origin === self.location.origin) {
      event.respondWith(staleWhileRevalidate(request, CACHE_NAME));
      return;
    }

    // Everything else — network-first with cache fallback
    event.respondWith(networkFirst(request, CACHE_NAME));
  });
}

// ─── Strategies ───────────────────────────────────────────────────────────────

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const freshPromise = fetch(request).then(res => {
    if (res.ok) cache.put(request, res.clone());
    return res;
  }).catch(() => null);
  return hit || await freshPromise || offlinePage();
}

async function networkFirst(request, cacheName) {
  try {
    const res = await fetch(request);
    if (res.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, res.clone());
    }
    return res;
  } catch {
    const cache = await caches.open(cacheName);
    return await cache.match(request) || new Response('Offline', { status: 503 });
  }
}

function offlinePage() {
  return new Response(
    `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>TakeoutFix — Offline</title>
    <style>*{box-sizing:border-box}body{margin:0;background:#09090b;color:#fff;font-family:system-ui,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;text-align:center;padding:2rem}
    h1{font-size:1.5rem;margin:0 0 .5rem}p{color:#71717a;margin:0}.badge{display:inline-block;background:#1c1c1f;border:1px solid #27272a;border-radius:9999px;padding:.25rem .75rem;font-size:.75rem;color:#a1a1aa;margin-top:1rem}</style>
    </head><body><div><h1>You're offline</h1>
    <p>TakeoutFix needs a connection to load auth. Once the app is loaded, photo processing works fully offline.</p>
    <div class="badge">TakeoutFix PWA</div></div></body></html>`,
    { headers: { 'Content-Type': 'text/html' } }
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
