const CACHE_NAME = 'alphabet-and-things-v9';
const VOICE_IDS = [
  'apple', 'ball', 'cat', 'dog', 'egg', 'fish', 'grapes', 'hat', 'ice-cream', 'juice', 'kite',
  'lion', 'moon', 'nose', 'orange', 'panda', 'rabbit', 'sun', 'train', 'umbrella', 'whale', 'zebra',
  'bear', 'bird', 'cow', 'duck', 'elephant', 'frog', 'horse', 'monkey', 'pig', 'turtle', 'bee',
  'sheep', 'bus', 'car', 'crane-truck', 'excavator', 'fire-truck', 'garbage-truck', 'helicopter',
  'leaf', 'police-car', 'ship', 'tractor', 'dump-truck', 'banana', 'carrot', 'cherries', 'lemon',
  'mango', 'pear', 'strawberry', 'tomato', 'watermelon', 'book', 'cup', 'toothbrush', 'ant',
  'airplane', 'bread', 'butterfly', 'cake', 'camel', 'dolphin', 'door', 'fork', 'goat', 'giraffe',
  'key', 'lamp', 'milk', 'octopus', 'owl', 'penguin', 'robot', 'spoon', 'star', 'tiger', 'unicorn',
  'watch', 'bulldozer', 'road-roller', 'monster-truck', 'fire-engine', 'forklift', 'race-car',
  'tank', 'crocodile', 'cattle', 'chicken', 'penguins', 'shark', 'blueberry', 'avocado', 'tree',
  'flower', 'fire', 'water', 'beef', 'rice',
];
const NUMBER_VALUES = Array.from({ length: 21 }, (_, value) => value);
const DIRECT_IMAGE_IDS = [
  'leaf', 'bulldozer', 'road-roller', 'monster-truck', 'fire-engine', 'forklift', 'race-car',
  'airplane', 'tank', 'crocodile', 'tiger', 'cattle', 'chicken', 'giraffe', 'penguins', 'shark',
  'blueberry', 'avocado', 'tree', 'flower', 'fire', 'water', 'milk', 'beef', 'rice',
];
const ENGLISH_NUMBER_PARTS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen',
  'nineteen', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety',
  'hundred', 'thousand', 'million',
];
const CHINESE_NUMBER_PARTS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'hundred', 'thousand', 'ten-thousand', 'hundred-million',
];
const CORE_ASSETS = [
  './',
  './manifest.webmanifest',
  './icon-64.png',
  './icon-192.png',
  './icon-512.png',
  './og.png',
  './things/object-atlas-v2.png',
  './things/expanded-object-atlas-v1.png',
  './audio/music/gentle-ocean-play.mp3',
  ...DIRECT_IMAGE_IDS.map((id) => `./things/${id}-v1.png`),
  ...VOICE_IDS.map((id) => `./audio/voice/items/${id}.mp3`),
  ...NUMBER_VALUES.map((value) => `./audio/voice/numbers/${value}.mp3`),
  ...ENGLISH_NUMBER_PARTS.map((id) => `./audio/voice/number-parts/en/${id}.mp3`),
  ...CHINESE_NUMBER_PARTS.map((id) => `./audio/voice/number-parts/zh/${id}.mp3`),
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
