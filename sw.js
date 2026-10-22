// sw.js
// The offline helper (a "service worker"): a small script the browser runs
// alongside the app. It keeps a copy of the app's files so the app can open
// with no internet connection. When online, it always fetches the latest
// files first, so updates show up right away; the saved copy is only used
// when the network is unavailable or very slow.
// This only affects the app's own files. Notes and tasks are saved separately
// (see storage.js).

const CACHE = 'anthology-files-v3';
const NETWORK_WAIT_MS = 4000;
const APP_FILES = [
  './',
  './index.html',
  './styles.css',
  './vendor/supabase-2.117.3.js',
  './config.js',
  './storage.js',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_FILES)));
  self.skipWaiting();
});

// Removes copies kept by earlier versions of this file.
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name !== CACHE) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(networkFirst(request));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  // "no-cache" asks the server whether the file has changed, rather than
  // trusting the browser's own short-term copy.
  const fromNetwork = fetch(request, { cache: 'no-cache' }).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  });
  const timeout = new Promise(resolve => setTimeout(resolve, NETWORK_WAIT_MS));

  try {
    const response = await Promise.race([fromNetwork, timeout]);
    if (response) return response;
    // The network is slow: use the saved copy if there is one, otherwise keep waiting.
    const saved = await cache.match(request, { ignoreSearch: true });
    return saved || await fromNetwork;
  } catch (err) {
    const saved = await cache.match(request, { ignoreSearch: true });
    if (saved) return saved;
    throw err;
  }
}
