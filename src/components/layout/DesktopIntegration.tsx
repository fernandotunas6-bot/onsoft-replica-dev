import { useEffect } from "react";
import { isTauriDesktop } from "@/lib/desktop-utils";
import { installDesktopDownloads } from "@/lib/desktop-downloads";

/**
 * Comportamentos da app desktop (Tauri). Só actua dentro da app; no browser não faz
 * nada.
 *  - Exportações (`<a download>`) abrem o diálogo nativo "Guardar como" (desktop-downloads).
 *  - macOS: `window.print()` passa pelo comando Rust `print_page` (o do WKWebView não
 *    faz nada). Windows e Linux imprimem com o do próprio webview.
 */
export function DesktopIntegration() {
  useEffect(() => {
    if (!isTauriDesktop()) return;

    const uninstallDownloads = installDesktopDownloads();

    const originalPrint = window.print.bind(window);
    if (/Mac/i.test(navigator.userAgent)) {
      window.print = () => {
        void import("@tauri-apps/api/core")
          .then(({ invoke }) => invoke("print_page"))
          .catch((error) => console.warn("[desktop] impressão falhou", error));
      };
    }

    return () => {
      window.print = originalPrint;
      uninstallDownloads();
    };
  }, []);

  return null;
}
