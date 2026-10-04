import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { isTauriDesktop, openExternalLink } from "@/lib/desktop-utils";
import { installDesktopDownloads } from "@/lib/desktop-downloads";
import { isExternalUrl, nextZoom, shortcutAction, storedZoom } from "@/lib/desktop-shortcuts";
import { checkNativeUpdate, installNativeUpdateWhenSafe } from "@/lib/native-updater";
import { pausedWriteCount, pendingWriteCount, writesLabel } from "@/lib/pending-writes";

const ZOOM_KEY = "siga:desktop-zoom";

/**
 * Comportamentos da app desktop (Tauri). Só actua dentro da app; no browser não faz
 * nada.
 *  - Links para fora do portal (target=_blank, window.open, mailto:, tel:) abrem no
 *    browser do sistema: o webview não abre separadores e esses cliques ficavam sem
 *    resposta.
 *  - Exportações (`<a download>`) abrem o diálogo nativo "Guardar como" (desktop-downloads).
 *  - macOS: `window.print()` passa pelo comando Rust `print_page` (o do WKWebView não
 *    faz nada). Windows e Linux imprimem com o do próprio webview.
 *  - Atalhos: F5/Ctrl+R recarregar, Alt+←/→ histórico, Ctrl/Cmd+P imprimir,
 *    Ctrl + / − / 0 zoom (lembrado).
 *    Recarregar com gravações à espera de rede pede confirmação (perdiam-se).
 *  - Versão nova publicada (release assinada): aviso com "Instalar e reiniciar", que
 *    nunca instala com gravações por enviar.
 */
export function DesktopIntegration() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isTauriDesktop()) return;

    const uninstallDownloads = installDesktopDownloads();

    const openOutside = (href: string) => {
      void openExternalLink(href).catch((error) =>
        console.warn("[desktop] não foi possível abrir a ligação", error),
      );
    };

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.hasAttribute("download")) return;
      if (!isExternalUrl(anchor.href, window.location.origin)) return;
      event.preventDefault();
      openOutside(anchor.href);
    };

    const originalOpen = window.open.bind(window);
    window.open = ((url?: string | URL, target?: string, features?: string) => {
      const href = url ? new URL(String(url), window.location.href).href : "";
      if (href && isExternalUrl(href, window.location.origin)) {
        openOutside(href);
        return null;
      }
      return originalOpen(url, target, features);
    }) as typeof window.open;

    const originalPrint = window.print.bind(window);
    if (/Mac/i.test(navigator.userAgent)) {
      window.print = () => {
        void import("@tauri-apps/api/core")
          .then(({ invoke }) => invoke("print_page"))
          .catch((error) => console.warn("[desktop] impressão falhou", error));
      };
    }

    let zoom = 1;
    try {
      zoom = storedZoom(localStorage.getItem(ZOOM_KEY));
    } catch {
      // Sem armazenamento local: começa sem zoom.
    }
    const applyZoom = async (value: number) => {
      zoom = value;
      try {
        localStorage.setItem(ZOOM_KEY, String(value));
      } catch {
        // O zoom aplica-se na mesma; só não fica lembrado.
      }
      try {
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
      if (action === "reload") {
        // O webview pode não mostrar o aviso do beforeunload: pergunta-se aqui.
        const waiting = pausedWriteCount(queryClient);
        if (
          waiting === 0 ||
          window.confirm(
            `Há ${writesLabel(waiting)} à espera de rede. Se recarregar, perdem-se. Recarregar mesmo assim?`,
          )
        ) {
          window.location.reload();
        }
      } else if (action === "print") window.print();
      else if (action === "back") window.history.back();
      else if (action === "forward") window.history.forward();
      else void applyZoom(nextZoom(zoom, action));
    };

    document.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKeyDown);

    // Versão nova da app: avisa uma vez, 15 s depois de abrir. Só instala quando a
    // pessoa carrega, e nunca a meio de gravações por enviar.
    const install = () => {
      void installNativeUpdateWhenSafe(pendingWriteCount(queryClient))
        .then(({ waiting }) => {
          if (waiting > 0) {
            toast.error(`Há ${writesLabel(waiting)} por enviar.`, {
              description: "Instale a versão nova depois de serem enviadas.",
            });
          }
        })
        .catch((error) =>
          toast.error("Não foi possível instalar a versão nova.", {
            description: error instanceof Error ? error.message : String(error),
          }),
        );
    };
    const updateTimer = window.setTimeout(() => {
      void checkNativeUpdate()
        .then((update) => {
          if (!update.available) return;
          toast.message(`Nova versão do SIGA (${update.version ?? "nova"})`, {
            description: "Grave o que estiver a fazer antes de instalar.",
            duration: Infinity,
            action: { label: "Instalar e reiniciar", onClick: install },
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
  }, [queryClient]);

  return null;
}
