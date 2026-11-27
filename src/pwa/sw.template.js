/* eslint-env serviceworker */
// LaserRange service worker: keeps a copy of the app on the device so it opens
// without a connection. This file is a template. The build fills in the build
// id and the list of files (see renderServiceWorker.js and vite.config.js) and
// writes the result to sw.js next to index.html.
//
// Rules:
// - Each build gets its own cache holding that build's page and files, so the
//   page and its scripts always match.
// - Opening the app asks the network for the page first, so a new build shows
//   up as soon as it is online. If the network fails or takes too long, the
//   saved copy is used.
// - Everything else is served from the saved copy when it is there.
// - A request that says "skip the saved copy" (the Check for update button)
//   always goes to the network, so the button can tell when it is offline.

const BUILD = '%BUILD%';
const FILES = ['%FILES%'];

const CACHE_PREFIX = 'laserrange-';
const CACHE = `${CACHE_PREFIX}${BUILD}`;
/** How long opening the app waits for the network before using the saved copy. */
const PAGE_TIMEOUT_MS = 4000;

const pageUrl = () => new URL('./', self.registration.scope).href;

// A build's cache holds exactly one copy of each file, so which request
// headers the server says its answer "varies" by does not matter. Without
// this, a host that sends "Vary: Origin" makes the saved scripts unfindable
// (seen with the local preview server).
const ANY_VARIANT = { ignoreVary: true };

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // 'reload' so the copy comes from the server, not from the browser's own short-term cache.
      .then((cache) => cache.addAll(FILES.map((file) => new Request(new URL(file, self.registration.scope).href, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function openPage() {
  const cache = await caches.open(CACHE);
  const saved = await cache.match(pageUrl(), ANY_VARIANT);
  const fresh = fetch(pageUrl(), { cache: 'no-cache' }).then((response) => {
    if (!response.ok) throw new Error(`Page request failed: ${response.status}`);
    return response;
  });
  if (!saved) return fresh;
  const timeout = new Promise((resolve) => setTimeout(() => resolve(saved), PAGE_TIMEOUT_MS));
  return Promise.race([fresh.catch(() => saved), timeout]);
}

async function fromCacheFirst(request) {
  const cache = await caches.open(CACHE);
  return (await cache.match(request, ANY_VARIANT)) ?? fetch(request);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;
  if (request.cache === 'reload') return; // an explicit "go to the network" request
  event.respondWith(request.mode === 'navigate' ? openPage() : fromCacheFirst(request));
});
