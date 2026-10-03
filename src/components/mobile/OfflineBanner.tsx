import * as React from "react";
import { CloudOff, Wifi } from "lucide-react";

import { useOnlineStatus } from "@/hooks/use-breakpoint";
import { cn } from "@/lib/utils";

/**
 * Estado da ligação (§46). O SIGA é uma PWA usada em escolas com rede
 * intermitente: sem este aviso, um formulário que falha a gravar parece um bug
 * da aplicação em vez de falta de rede.
 *
 * Quando a ligação volta, mostra-se "restaurada" por três segundos e desaparece
 * — um aviso permanente de sucesso é ruído.
 */
export function OfflineBanner() {
  const { online, wasOffline } = useOnlineStatus();
  const [showRestored, setShowRestored] = React.useState(false);

  React.useEffect(() => {
    if (!online || !wasOffline) return;
    setShowRestored(true);
    const timer = window.setTimeout(() => setShowRestored(false), 3000);
    return () => window.clearTimeout(timer);
  }, [online, wasOffline]);

  if (online && !showRestored) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center gap-2 px-4 py-1.5 text-[11px]",
        online ? "bg-success/10 text-success-strong" : "bg-warning/15 text-warning-strong",
      )}
    >
      {online ? (
        <>
          <Wifi className="size-3.5 shrink-0" aria-hidden />
          Ligação restaurada.
        </>
      ) : (
        <>
          <CloudOff className="size-3.5 shrink-0" aria-hidden />
          <span className="min-w-0">
            Sem ligação — algumas funções estão limitadas e as alterações podem não gravar.
          </span>
        </>
      )}
    </div>
  );
}
