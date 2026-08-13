/* SIGA runtime cache. This file lives in public so Nitro publishes it at /sw.js. */
const CACHE_VERSION = "v3";
const CACHES = {
  pages: `siga-pages-${CACHE_VERSION}`,
  assets: `siga-assets-${CACHE_VERSION}`,
  images: `siga-images-${CACHE_VERSION}`,
  fonts: `siga-fonts-${CACHE_VERSION}`,
};
const OFFLINE_PAGE = "/offline.html";

const cacheResponse = async (cacheName, request, response) => {
  if (response && response.ok) {
    await caches.open(cacheName).then((cache) => cache.put(request, response.clone()));
  }
  return response;
};

const networkFirst = async (request) => {
  try {
    return await cacheResponse(CACHES.pages, request, await fetch(request));
  } catch {
    const cached = await caches.match(request);
    return cached ?? (await caches.match(OFFLINE_PAGE)) ?? Response.error();
  }
};

const cacheFirst = async (cacheName, request) => {
  const cached = await caches.match(request);
  return cached ?? cacheResponse(cacheName, request, await fetch(request));
};

const staleWhileRevalidate = async (cacheName, request) => {
  const cached = await caches.match(request);
  const update = cacheResponse(cacheName, request, await fetch(request)).catch(() => undefined);
  return cached ?? (await update) ?? Response.error();
};

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHES.pages).then((cache) => cache.add(OFFLINE_PAGE)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("siga-") && !Object.values(CACHES).includes(key))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }
  if (url.origin === self.location.origin && ["script", "style", "font"].includes(request.destination)) {
    event.respondWith(cacheFirst(CACHES.assets, request));
    return;
  }
  if (request.destination === "image") {
    event.respondWith(staleWhileRevalidate(CACHES.images, request));
    return;
  }
  if (/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(url.href)) {
    event.respondWith(staleWhileRevalidate(CACHES.fonts, request));
  }
});
