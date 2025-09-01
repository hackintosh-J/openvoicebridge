
// OpenVoiceBridge service worker
const CACHE_NAME = 'ovb-cache-v1';
const CORE_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './srt.js',
  './utils.js',
  './manifest.webmanifest',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/logo.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => (k === CACHE_NAME ? null : caches.delete(k)))))
  );
  self.clients.claim();
});

// Strategy: cache-first for core; network-first for model files from CDN with fallback to cache
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Cache-first for core assets
  if (CORE_ASSETS.some(path => url.pathname.endsWith(path.replace('./','/')))) {
    event.respondWith(
      caches.match(event.request).then(resp => resp || fetch(event.request))
    );
    return;
  }

  // Models and ONNX / wasm from common CDNs
  const isModel = /(cdn.jsdelivr.net|unpkg.com|huggingface\.co).*\/(onnx|model|json|bin|wasm|data)/.test(url.href);
  if (isModel) {
    event.respondWith(
      (async () => {
        try {
          const net = await fetch(event.request);
          const cache = await caches.open(CACHE_NAME);
          cache.put(event.request, net.clone());
          return net;
        } catch (e) {
          const cached = await caches.match(event.request);
          if (cached) return cached;
          throw e;
        }
      })()
    );
    return;
  }

  // Default: try network, fall back to cache
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
