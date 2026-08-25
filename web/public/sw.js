const CACHE_NAME = 'alphabet-and-things-v1';
const CORE_ASSETS = [
  './',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './og.png',
];

async function cacheApplicationShell() {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(CORE_ASSETS);

  const pageResponse = await fetch('./');
  if (!pageResponse.ok) return;
  const pageText = await pageResponse.clone().text();
  await cache.put('./', pageResponse);

  const assetPaths = [...pageText.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
    .map((match) => new URL(match[1], self.location.href))
    .filter((url) => url.origin === self.location.origin)
    .map((url) => url.href);

  await Promise.all(assetPaths.map(async (assetUrl) => {
    try {
      const response = await fetch(assetUrl);
      if (!response.ok) return;

      const cssText = assetUrl.endsWith('.css') ? await response.clone().text() : '';
      await cache.put(assetUrl, response);

      if (cssText) {
        const cssAssets = [...cssText.matchAll(/url\(["']?([^"')]+)["']?\)/g)]
          .map((match) => new URL(match[1], assetUrl))
          .filter((url) => url.origin === self.location.origin)
          .map((url) => url.href);

        await Promise.all(cssAssets.map(async (cssAssetUrl) => {
          const cssAssetResponse = await fetch(cssAssetUrl);
          if (cssAssetResponse.ok) await cache.put(cssAssetUrl, cssAssetResponse);
        }));
      }
    } catch {
      // A single optional asset should not prevent offline installation.
    }
  }));
}

self.addEventListener('install', (event) => {
  event.waitUntil(cacheApplicationShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(async (response) => {
          const cache = await caches.open(CACHE_NAME);
          if (response.ok) await cache.put(event.request, response.clone());
          return response;
        })
        .catch(async () => (await caches.match(event.request)) ?? (await caches.match('./'))),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(async (cached) => {
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(event.request, response.clone());
      }
      return response;
    }),
  );
});
