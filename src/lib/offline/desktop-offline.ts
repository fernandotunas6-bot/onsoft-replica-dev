import type { QueryClient } from "@tanstack/react-query";
import { readStoredActiveSchool } from "@/features/auth/active-school";
import { desktopVault, isDesktopSessionRuntime } from "@/lib/desktop-session-vault";
import { enableOutbox, vaultOutboxStorage } from "@/lib/offline/outbox";
import { persistOfflineQueries, restoreOfflineQueries } from "@/lib/offline/offline-queries";

/**
 * Páginas de trabalho que a app desktop prepara para abrir sem rede: início, área
 * pedagógica (chamada e pautas), tesouraria, calendário e alunos.
 */
export const OFFLINE_PAGES = ["/", "/pedagogica", "/tesouraria", "/calendario", "/alunos"];

type ChunkLoader = {
  routesByPath: Record<string, unknown>;
  loadRouteChunk: (route: never) => Promise<unknown>;
};

/**
 * Liga o modo sem rede da app desktop (no navegador não faz nada):
 *  - o Service Worker passa a guardar as páginas e pré-carrega as de trabalho;
 *  - o código JavaScript dessas páginas é carregado já, para abrirem sem rede;
 *  - as consultas da instituição ficam guardadas e repõem-se se a app abrir sem rede;
 *  - a fila de envio liga-se ao cofre quando o PIN o abre.
 */
export function startDesktopOffline(queryClient: QueryClient, router?: ChunkLoader) {
  if (!isDesktopSessionRuntime()) return () => undefined;

  const online = navigator.onLine !== false;
  void enableDesktopPagesOffline();
  if (online && router) void preloadPageCode(router);

  if (!online) restoreOfflineQueries(queryClient, readStoredActiveSchool());
  const stopPersisting = persistOfflineQueries(queryClient, readStoredActiveSchool);

  void desktopVault().then((vault) => enableOutbox(vaultOutboxStorage(vault)));

  return stopPersisting;
}

/**
 * Pede ao Service Worker para guardar páginas (e pré-carregar as de trabalho, com rede).
 * Também a cada início de sessão: terminar sessão apaga as caches do SIGA, marca incluída.
 */
export async function enableDesktopPagesOffline() {
  if (!isDesktopSessionRuntime() || !("serviceWorker" in navigator)) return;
  const online = navigator.onLine !== false;
  try {
    const registration = await navigator.serviceWorker.ready;
    registration.active?.postMessage({
      type: "SIGA_DESKTOP_OFFLINE",
      paths: online ? OFFLINE_PAGES : [],
    });
  } catch {
    // Sem Service Worker (ex.: WebView sem suporte): só a fila e a cache de consultas.
  }
}

async function preloadPageCode(router: ChunkLoader) {
  for (const path of OFFLINE_PAGES) {
    const route = router.routesByPath[path];
    if (!route) continue;
    await router.loadRouteChunk(route as never).catch(() => undefined);
  }
}
