import { useEffect, useState } from "react";
import { X, Minus, Square } from "lucide-react";

type TauriWindow = Window & {
  __TAURI_INTERNALS__?: unknown;
  __TAURI__?: unknown;
};

export function TauriTitlebar() {
  const [isTauri, setIsTauri] = useState(false);
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    const tauriWindow = window as TauriWindow;
    if (tauriWindow.__TAURI_INTERNALS__ || tauriWindow.__TAURI__) {
      setIsTauri(true);
      if (navigator.userAgent.includes("Mac")) {
        setIsMac(true);
      }
      document.body.classList.add("pt-[38px]");
    }
  }, []);

  if (!isTauri) return null;

  const minimize = async () => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().minimize();
    } catch (e) {
      console.error(e);
    }
  };

  const toggleMaximize = async () => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      const isMaximized = await win.isMaximized();
      if (isMaximized) {
        await win.unmaximize();
      } else {
        await win.maximize();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const close = async () => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().close();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div
      data-tauri-drag-region
      className="fixed top-0 z-50 flex h-[38px] w-full select-none items-center justify-between border-b border-border bg-background/80 text-foreground backdrop-blur-md"
    >
      <div
        data-tauri-drag-region
        className={`flex flex-1 items-center ${isMac ? "pl-[80px]" : "pl-4"} text-xs font-semibold opacity-70`}
      >
        SIGA Workspace
      </div>

      {!isMac && (
        <div className="flex h-full">
          <button
            onClick={minimize}
            className="flex h-full items-center justify-center px-4 transition-colors hover:bg-muted"
          >
            <Minus size={14} />
          </button>
          <button
            onClick={toggleMaximize}
            className="flex h-full items-center justify-center px-4 transition-colors hover:bg-muted"
          >
            <Square size={12} />
          </button>
          <button
            onClick={close}
            className="flex h-full items-center justify-center px-4 transition-colors hover:bg-destructive hover:text-destructive-foreground"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
