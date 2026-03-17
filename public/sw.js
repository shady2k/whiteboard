const SW_VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE_PREFIX = 'whiteboard';
const CACHE_NAME = `${CACHE_PREFIX}-${SW_VERSION}`;
const PRECACHE_URLS = ['/'];

function isCacheable(response) {
  return response && response.ok;
}

async function putInCache(request, response) {
  if (!isCacheable(response)) return response;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
  return response;
}

async function matchInCache(request) {
  const cache = await caches.open(CACHE_NAME);
  return cache.match(request);
}

async function networkFirst(request, fallbackUrl) {
  try {
    const response = await fetch(request);
    return await putInCache(request, response);
  } catch (error) {
    const cached = await matchInCache(request);
    if (cached) return cached;

    if (fallbackUrl) {
      const fallback = await matchInCache(fallbackUrl);
      if (fallback) return fallback;
    }

    throw error;
  }
}

async function cacheFirst(request) {
  const cached = await matchInCache(request);
  if (cached) return cached;

  const response = await fetch(request);
  return putInCache(request, response);
}

// Install: cache app shell (don't skipWaiting — let client control activation)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
});

// Activate: clean old caches, then claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith(`${CACHE_PREFIX}-`) && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Client tells us when it's ready for the new version
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Fetch handler
self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigation: network-first, fall back to cached app shell
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, '/'));
    return;
  }

  // API: network-only, no caching (mutable collaborative state)
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // JS/CSS: network-first so code updates are picked up
  if (request.destination === 'script' || request.destination === 'style') {
    event.respondWith(networkFirst(request));
    return;
  }

  // Images/fonts: cache-first (immutable assets)
  if (request.destination === 'image' || request.destination === 'font') {
    event.respondWith(cacheFirst(request));
  }
});
