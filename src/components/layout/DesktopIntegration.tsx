import { useEffect } from "react";
import { isTauriDesktop, openExternalLink } from "@/lib/desktop-utils";
import { isExternalHttpUrl, nextZoom, shortcutAction } from "@/lib/desktop-shortcuts";
import { installDesktopDownloads } from "@/lib/desktop-downloads";

const ZOOM_KEY = "siga:desktop-zoom";

/**
 * Comportamentos de aplicação desktop (Tauri). Só actua dentro da app; no browser
 * não faz nada.
 *  - Links para fora do SIGA (target=_blank, window.open) abrem no browser do sistema:
 *    o webview não abre separadores e esses cliques ficavam sem resposta.
 *  - Exportações (`<a download>`) abrem o diálogo nativo "Guardar como" (desktop-downloads).
 *  - macOS: `window.print()` passa pelo comando Rust `print_page`.
 *  - Versão nova publicada (updater assinado): aviso com "Instalar e reiniciar".
 *  - Atalhos: F5/Ctrl+R recarregar, Alt+←/→ histórico, Ctrl + / − / 0 zoom (lembrado).
 */
export function DesktopIntegration() {
  useEffect(() => {
    if (!isTauriDesktop()) return;

    const uninstallDownloads = installDesktopDownloads();

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.hasAttribute("download")) return;
      const external =
        isExternalHttpUrl(anchor.href, window.location.origin) ||
        /^(mailto|tel):/i.test(anchor.href);
      if (!external) return; // mesma origem (mesmo com _blank): o webview trata.
      event.preventDefault();
      void openExternalLink(anchor.href);
    };

    const originalOpen = window.open.bind(window);
    window.open = ((url?: string | URL, target?: string, features?: string) => {
      const href = url ? new URL(String(url), window.location.href).href : "";
      if (href && isExternalHttpUrl(href, window.location.origin)) {
        void openExternalLink(href);
        return null;
      }
      return originalOpen(url, target, features);
    }) as typeof window.open;

    // macOS: o window.print() do WKWebView não faz nada; imprime-se pelo Rust.
    // Windows e Linux imprimem bem com o do próprio webview.
    const originalPrint = window.print.bind(window);
    if (/Mac/i.test(navigator.userAgent)) {
      window.print = () => {
        void import("@tauri-apps/api/core")
          .then(({ invoke }) => invoke("print_page"))
          .catch((error) => console.warn("[desktop] impressão falhou", error));
      };
    }

    let zoom = Number(localStorage.getItem(ZOOM_KEY)) || 1;
    const applyZoom = async (value: number) => {
      zoom = value;
      try {
        localStorage.setItem(ZOOM_KEY, String(value));
        const { getCurrentWebview } = await import("@tauri-apps/api/webview");
        await getCurrentWebview().setZoom(value);
      } catch (error) {
        console.warn("[desktop] zoom indisponível", error);
      }
    };
    if (zoom !== 1) void applyZoom(zoom);

    const onKeyDown = (event: KeyboardEvent) => {
      const action = shortcutAction(event);
      if (!action) return;
      event.preventDefault();
      if (action === "reload") window.location.reload();
      else if (action === "back") window.history.back();
      else if (action === "forward") window.history.forward();
      else void applyZoom(nextZoom(zoom, action));
    };

    document.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKeyDown);

    // Versão nova da app: avisa uma vez, 15 s depois de abrir. Só instala quando a
    // pessoa carrega (nunca a meio de um trabalho por gravar).
    const updateTimer = window.setTimeout(() => {
      void import("@/lib/native-updater")
        .then(async ({ checkNativeUpdate, installNativeUpdate }) => {
          const info = await checkNativeUpdate();
          if (!info.available) return;
          const { toast } = await import("sonner");
          toast.message(`Nova versão do SIGA (${info.version})`, {
            description: "Grave o que estiver a fazer antes de instalar.",
            duration: Infinity,
            action: {
              label: "Instalar e reiniciar",
              onClick: () => {
                void installNativeUpdate().catch((error) =>
                  toast.error("Não foi possível instalar a actualização.", {
                    description: error instanceof Error ? error.message : undefined,
                  }),
                );
              },
            },
          });
        })
        .catch((error) => console.warn("[desktop] verificação de versão falhou", error));
    }, 15_000);

    return () => {
      window.clearTimeout(updateTimer);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("keydown", onKeyDown);
      window.open = originalOpen;
      window.print = originalPrint;
      uninstallDownloads();
    };
  }, []);

  return null;
}
