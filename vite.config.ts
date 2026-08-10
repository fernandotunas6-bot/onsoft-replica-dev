// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

// Versão dos caches: subir esta constante invalida imagens/ícones/bundles antigos
// sem quebrar a aparência (o conteúdo novo entra por stale-while-revalidate).
const CACHE_VERSION = "v2";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [
      VitePWA({
        strategies: "generateSW",
        registerType: "autoUpdate",
        injectRegister: null,
        filename: "sw.js",
        devOptions: { enabled: false },
        manifest: {
          name: "SIGA — Sistema Integrado de Gestão Académica",
          short_name: "SIGA",
          description:
            "Gestão escolar completa: estudantes, matrículas, pedagógico, finanças e relatórios.",
          start_url: "/",
          scope: "/",
          display: "standalone",
          background_color: "#ffffff",
          theme_color: "#6a2ce0",
          icons: [
            { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
            {
              src: "/icons/icon-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
          orientation: "portrait",
          categories: ["education", "productivity"],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,woff,woff2,png,svg,ico,webmanifest}", "offline.html"],
          // Fallback offline: se a rede falhar e a página não estiver em cache.
          navigateFallback: "/offline.html",
          navigateFallbackDenylist: [/^\/~oauth/, /^\/api\//],
          additionalManifestEntries: [{ url: "/offline.html", revision: CACHE_VERSION }],
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          runtimeCaching: [
            {
              // Navegações sempre pela rede primeiro (nunca HTML antigo).
              urlPattern: ({ request }: { request: Request }) => request.mode === "navigate",
              handler: "NetworkFirst",
              options: {
                cacheName: `siga-pages-${CACHE_VERSION}`,
                networkTimeoutSeconds: 4,
                expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 },
              },
            },
            {
              // Assets com hash do próprio site: cache first (mais rápido possível).
              urlPattern: ({ request, sameOrigin }: { request: Request; sameOrigin: boolean }) =>
                sameOrigin && ["script", "style", "font"].includes(request.destination),
              handler: "CacheFirst",
              options: {
                cacheName: `siga-assets-${CACHE_VERSION}`,
                expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              },
            },
            {
              // Imagens e ícones.
              urlPattern: ({ request }: { request: Request }) => request.destination === "image",
              handler: "StaleWhileRevalidate",
              options: {
                cacheName: `siga-images-${CACHE_VERSION}`,
                expiration: { maxEntries: 150, maxAgeSeconds: 60 * 60 * 24 * 30 },
              },
            },
            {
              // Tipografia externa (Google Fonts).
              urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
              handler: "StaleWhileRevalidate",
              options: {
                cacheName: `siga-fonts-${CACHE_VERSION}`,
                expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              },
            },
          ],
        },
      }),
    ],
  },
});
