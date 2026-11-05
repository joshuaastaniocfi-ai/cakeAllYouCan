/**
 * Goldilocks Cake All You Can - Service Worker
 * Intercepts cold-start delays on Render Free Tier and serves an instant
 * animated wake-up screen with auto-polling.
 */

const CACHE_NAME = 'goldilocks-wakeup-v1';
const PRECACHE_ASSETS = [
  '/wake-up.html',
  '/server-wakeup.css',
  '/server-wakeup.js',
  '/Assets/goldilocks-logo.png',
  '/Assets/goldilocks-logo-yellow.png',
  '/Assets/cake%20icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE_ASSETS).catch(err => {
        console.warn('Pre-caching partial failure:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(k => {
          if (k !== CACHE_NAME) return caches.delete(k);
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // 1. Navigation requests (Opening the site or admin portal)
  if (req.mode === 'navigate' || req.destination === 'document') {
    // Attempt network fetch with a 2200ms timeout for cold start detection
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Render cold start timeout')), 2200);
    });

    event.respondWith(
      Promise.race([fetch(req), timeoutPromise])
        .catch(async () => {
          // Server is likely sleeping on Render free tier.
          // Return the cached wake-up page with the return URL!
          const cache = await caches.open(CACHE_NAME);
          const cachedWakeup = await cache.match('/wake-up.html');
          if (cachedWakeup) {
            return cachedWakeup;
          }
          // Fallback if not cached yet
          return fetch(req);
        })
    );
    return;
  }

  // 2. Skip API calls from caching (always network)
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // 3. Static assets: Stale-while-revalidate for fast rendering
  event.respondWith(
    caches.match(req).then(cached => {
      const netFetch = fetch(req).then(res => {
        if (res && res.status === 200 && req.method === 'GET') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, clone));
        }
        return res;
      }).catch(() => cached);

      return cached || netFetch;
    })
  );
});
