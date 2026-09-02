import { useEffect, useState } from "react";
import { X, Minus, Square } from "lucide-react";

export function TauriTitlebar() {
  const [isTauri, setIsTauri] = useState(false);

  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    // Check if running in Tauri
    if (window.__TAURI_INTERNALS__ || window.__TAURI__) {
      setIsTauri(true);
      if (navigator.userAgent.includes('Mac')) {
        setIsMac(true);
      }
      document.body.classList.add("pt-[38px]"); // Espaço nativo para macOS Titlebar
    }
  }, []);

  if (!isTauri) return null;

  const minimize = async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().minimize();
    } catch (e) {
      console.error(e);
    }
  };

  const toggleMaximize = async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
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
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().close();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div 
      data-tauri-drag-region 
      className="h-[38px] bg-background/80 backdrop-blur-md border-b border-border w-full flex items-center justify-between select-none fixed top-0 z-50 text-foreground"
    >
      <div data-tauri-drag-region className={`flex-1 flex items-center ${isMac ? 'pl-[80px]' : 'pl-4'} text-xs font-semibold opacity-70`}>
        SIGA Workspace
      </div>
      
      {!isMac && (
        <div className="flex h-full">
          <button onClick={minimize} className="h-full px-4 hover:bg-muted transition-colors flex items-center justify-center">
            <Minus size={14} />
          </button>
          <button onClick={toggleMaximize} className="h-full px-4 hover:bg-muted transition-colors flex items-center justify-center">
            <Square size={12} />
          </button>
          <button onClick={close} className="h-full px-4 hover:bg-destructive hover:text-destructive-foreground transition-colors flex items-center justify-center">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
