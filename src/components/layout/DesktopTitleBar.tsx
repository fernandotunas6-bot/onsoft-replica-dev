import { useEffect, useState } from "react";
import { Minus, Square, X } from "lucide-react";
import {
  isTauriDesktop,
  minimizeWindow,
  toggleMaximizeWindow,
  closeWindow,
} from "@/lib/tauri-bridge";
import { cn } from "@/lib/utils";

/**
 * Barra de título única da app desktop (Tauri).
 *
 * Antes havia duas (TauriTitlebar na raiz e esta no shell), mais a nativa:
 * três barras no Windows. Agora só esta, desenhada na raiz para cobrir também
 * o ecrã de entrada.
 *  - macOS: a janela usa `titleBarStyle: Overlay`; os semáforos nativos ficam
 *    por cima, à esquerda. Deixamos-lhes espaço e não desenhamos botões.
 *  - Windows/Linux: sem decoração nativa (tauri.windows/linux.conf.json); os
 *    botões minimizar/maximizar/fechar são estes.
 * O duplo clique na zona de arrasto maximiza (nativo do Tauri).
 * `data-desktop` no <html> liga `--titlebar-h` (styles.css), que o shell
 * desconta da altura do ecrã. Atributo e não estilo inline: a aparência limpa
 * as variáveis inline sempre que muda de tema.
 */
const TITLEBAR_HEIGHT = 36;

export function DesktopTitleBar() {
  // Decidido só depois de montar: o servidor não tem `window`. Desenhar a
  // barra no servidor e escondê-la no browser dava erro de hidratação (#418).
  const [visible, setVisible] = useState(false);
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    const desktop = isTauriDesktop();
    if (!desktop && !window.location.search.includes("show_titlebar")) return;
    const mac = /Mac/i.test(navigator.userAgent);
    setIsMac(mac);
    setVisible(true);
    const root = document.documentElement;
    root.dataset["desktop"] = mac ? "macos" : "windows";
    return () => {
      delete root.dataset["desktop"];
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      data-tauri-drag-region
      className={cn(
        "fixed inset-x-0 top-0 z-[60] flex select-none items-center justify-between",
        "border-b border-border/60 bg-background/85 text-muted-foreground backdrop-blur-md",
      )}
      style={{ height: TITLEBAR_HEIGHT }}
      data-titlebar=""
    >
      <div
        data-tauri-drag-region
        className={cn(
          "pointer-events-none flex min-w-0 flex-1 items-center gap-2 text-xs font-medium",
          isMac ? "justify-center" : "pl-3.5",
        )}
      >
        <span className="text-foreground/80">SIGA</span>
      </div>

      {!isMac ? (
        <div className="flex h-full items-stretch">
          <TitleBarButton label="Minimizar" onClick={() => void minimizeWindow()}>
            <Minus className="size-3.5" strokeWidth={1.75} />
          </TitleBarButton>
          <TitleBarButton label="Maximizar / Restaurar" onClick={() => void toggleMaximizeWindow()}>
            <Square className="size-3" strokeWidth={1.75} />
          </TitleBarButton>
          <TitleBarButton label="Fechar" danger onClick={() => void closeWindow()}>
            <X className="size-3.5" strokeWidth={1.75} />
          </TitleBarButton>
        </div>
      ) : null}
    </div>
  );
}

function TitleBarButton({
  label,
  danger = false,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "flex w-11 items-center justify-center transition-colors focus-visible:outline-none",
        danger
          ? "hover:bg-[#c42b1c] hover:text-white"
          : "hover:bg-foreground/[0.06] hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
