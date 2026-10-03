import { useEffect } from "react";
import { isTauriDesktop } from "@/lib/desktop-utils";
import { installDesktopDownloads } from "@/lib/desktop-downloads";

/**
 * Comportamentos da app desktop (Tauri). Só actua dentro da app; no browser não faz
 * nada.
 *  - Exportações (`<a download>`) abrem o diálogo nativo "Guardar como" (desktop-downloads).
 */
export function DesktopIntegration() {
  useEffect(() => {
    if (!isTauriDesktop()) return;
    return installDesktopDownloads();
  }, []);

  return null;
}
