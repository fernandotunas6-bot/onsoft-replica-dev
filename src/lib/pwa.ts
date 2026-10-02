/**
 * Registo do Service Worker (cache persistente de recursos e imagens).
 * Nunca registamos em dev, dentro de iframes ou nos previews da Lovable —
 * caso contrário o preview podia servir HTML antigo.
 */
const SW_URL = "/sw.js";

function isBlockedContext() {
  if (typeof window === "undefined") return true;
  if (!import.meta.env.PROD) return true;
  if (window.self !== window.top) return true;

  const host = window.location.hostname;
  if (host.startsWith("id-preview--") || host.startsWith("preview--")) return true;
  if (host === "lovableproject.com" || host.endsWith(".lovableproject.com")) return true;
  if (host === "lovableproject-dev.com" || host.endsWith(".lovableproject-dev.com")) return true;
  if (host === "beta.lovable.dev" || host.endsWith(".beta.lovable.dev")) return true;
  if (
    new URLSearchParams(window.location.search).has("sw") &&
    new URLSearchParams(window.location.search).get("sw") === "off"
  )
    return true;

  return false;
}

async function unregisterAppWorkers() {
  if (!("serviceWorker" in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations().catch(() => []);
  await Promise.allSettled(
    regs
      .filter((r) => {
        const url = r.active?.scriptURL ?? r.installing?.scriptURL ?? r.waiting?.scriptURL ?? "";
        return url.endsWith(SW_URL);
      })
      .map((r) => r.unregister()),
  );
}

/**
 * Evento disparado quando existe uma versão nova em espera (§120).
 *
 * Não se recarrega a página sozinho: quem está a meio de uma pauta ou de uma
 * matrícula perde o que escreveu. O aviso fica visível, discreto, e a troca
 * acontece quando o utilizador disser.
 */
export const SW_UPDATE_READY_EVENT = "siga:sw-update-ready";

/** O worker em espera, guardado para o botão "Actualizar" o activar. */
let waitingWorker: ServiceWorker | null = null;

function announceUpdate(worker: ServiceWorker | null) {
  if (!worker) return;
  waitingWorker = worker;
  window.dispatchEvent(new CustomEvent(SW_UPDATE_READY_EVENT));
}

/**
 * Activa a versão em espera e recarrega. Chamado pelo botão do aviso — nunca
 * automaticamente.
 */
export function applyPendingUpdate() {
  if (!waitingWorker) {
    window.location.reload();
    return;
  }
  // `controllerchange` dispara quando o novo worker assume; só então vale a pena
  // recarregar, ou a página volta a ser servida pelo worker antigo.
  navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), {
    once: true,
  });
  waitingWorker.postMessage({ type: "SKIP_WAITING" });
}

export function registerServiceWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

  if (isBlockedContext()) {
    void unregisterAppWorkers();
    return;
  }

  navigator.serviceWorker
    .register(SW_URL, { scope: "/" })
    .then((registration) => {
      // Já havia uma versão em espera antes desta carga da página.
      if (registration.waiting && navigator.serviceWorker.controller) {
        announceUpdate(registration.waiting);
      }
      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          // `controller` nulo significa primeira instalação: não há nada a
          // actualizar e mostrar o aviso aí só confundia.
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            announceUpdate(registration.waiting ?? installing);
          }
        });
      });
    })
    .catch(() => {});
}

/** Remove persistent resources when an account leaves a shared device. */
export async function clearSigaCaches(): Promise<void> {
  if (typeof caches === "undefined") return;
  const keys = await caches.keys();
  await Promise.all(keys.filter((key) => key.startsWith("siga-")).map((key) => caches.delete(key)));
}
