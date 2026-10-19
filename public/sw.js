/* SIGA runtime cache. This file lives in public so Nitro publishes it at /sw.js. */
const CACHE_VERSION = "v5";
const CACHES = {
  pages: `siga-pages-${CACHE_VERSION}`,
  assets: `siga-assets-${CACHE_VERSION}`,
  images: `siga-images-${CACHE_VERSION}`,
  fonts: `siga-fonts-${CACHE_VERSION}`,
};
const OFFLINE_PAGE = "/offline.html";

const cacheResponse = async (cacheName, request, response) => {
  if (
    response &&
    response.ok &&
    !/(private|no-store)/i.test(response.headers.get("cache-control") || "")
  ) {
    await caches.open(cacheName).then((cache) => cache.put(request, response.clone()));
  }
  return response;
};

/* Páginas sem rede, só na app desktop (posto com PIN).
   No navegador, o HTML de navegação nunca é guardado (auditoria de 30/09: computadores
   partilhados). Na app desktop, a página marca o modo com SIGA_DESKTOP_OFFLINE e cada
   página aberta passa a ficar guardada para abrir sem rede. O HTML não tem dados pessoais:
   o servidor nunca recebe a sessão (fica no cofre do cliente), só os cookies da escola
   activa e do indicador «tem sessão». Terminar sessão apaga tudo (clearSigaCaches). */
const DESKTOP_MARKER = "/__siga-desktop-offline";

const desktopOffline = async () =>
  Boolean(await caches.match(DESKTOP_MARKER, { cacheName: CACHES.pages }));

const pageKey = (url) => new URL(url).origin + new URL(url).pathname;

const cachePage = async (url, response) => {
  if (!response || !response.ok) return response;
  if (!(response.headers.get("content-type") || "").includes("text/html")) return response;
  await (await caches.open(CACHES.pages)).put(pageKey(url), response.clone());
  return response;
};

const networkFirst = async (request) => {
  const keepPages = await desktopOffline();
  try {
    const response = await fetch(request);
    return keepPages ? await cachePage(request.url, response) : response;
  } catch {
    const saved = keepPages
      ? await caches.match(pageKey(request.url), { cacheName: CACHES.pages })
      : undefined;
    return saved ?? (await caches.match(OFFLINE_PAGE)) ?? Response.error();
  }
};

/* Com rede, a app desktop pede as páginas de trabalho para abrirem sem rede mesmo que
   ainda não tenham sido visitadas neste computador. */
const warmPages = async (paths) => {
  if (!(await desktopOffline())) return;
  const list = Array.isArray(paths) ? paths.slice(0, 20) : [];
  await Promise.allSettled(
    list
      .filter((path) => typeof path === "string" && /^\/(?!\/)/.test(path))
      .map(async (path) => {
        const url = new URL(path, self.location.origin).href;
        const response = await fetch(url, {
          credentials: "same-origin",
          headers: { Accept: "text/html" },
        });
        await cachePage(url, response);
      }),
  );
};

const enableDesktopOffline = async () =>
  (await caches.open(CACHES.pages)).put(DESKTOP_MARKER, new Response("1"));

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
});

/* Fica em espera até o cliente confirmar (botão "Actualizar" do aviso em pwa.ts) —
   sem isto, skipWaiting corre logo no install e a versão nova nunca fica "em espera"
   para ser aceite. */
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
  if (event.data?.type === "SIGA_DESKTOP_OFFLINE") {
    event.waitUntil(enableDesktopOffline().then(() => warmPages(event.data.paths)));
  }
  if (event.data?.type === "SIGA_WARM_PAGES") event.waitUntil(warmPages(event.data.paths));
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
  if (
    url.origin === self.location.origin &&
    ["script", "style", "font"].includes(request.destination)
  ) {
    event.respondWith(cacheFirst(CACHES.assets, request));
    return;
  }
  if (
    request.destination === "image" &&
    url.origin === self.location.origin &&
    /^(\/icons\/|\/images\/|\/favicon)/.test(url.pathname)
  ) {
    event.respondWith(staleWhileRevalidate(CACHES.images, request));
    return;
  }
  if (/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(url.href)) {
    event.respondWith(staleWhileRevalidate(CACHES.fonts, request));
  }
});

/* Suporte a notificações Push para Android, Web e PWA */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }

  const title = data.notification?.title || data.title || "SIGA Plus";
  const options = {
    body: data.notification?.body || data.body || "Nova notificação da instituição de ensino",
    icon: data.notification?.icon || "/favicon.png",
    badge: "/favicon.png",
    vibrate: [200, 100, 200],
    tag: data.data?.tag || data.tag || "siga-alert",
    data: {
      url: data.data?.url || data.data?.click_action || data.url || "/",
      ...data.data,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(targetUrl) && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    }),
  );
});
