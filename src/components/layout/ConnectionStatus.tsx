import { useEffect, useRef, useState } from "react";
import { Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

type Status = "online" | "offline" | "back";

/**
 * Aviso discreto de ligação (app desktop, PWA e browser): uma pílula em baixo, ao
 * centro, enquanto não há rede, e "Ligação restabelecida" durante 3 s quando volta.
 * Sem rede, gravar falha — o aviso diz isso antes de o utilizador perder trabalho.
 */
export function ConnectionStatus() {
  const [status, setStatus] = useState<Status>("online");
  const timer = useRef<number>(0);

  useEffect(() => {
    if (!navigator.onLine) setStatus("offline");
    const goOffline = () => {
      window.clearTimeout(timer.current);
      setStatus("offline");
    };
    const goOnline = () => {
      setStatus("back");
      timer.current = window.setTimeout(() => setStatus("online"), 3000);
    };
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.clearTimeout(timer.current);
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  if (status === "online") return null;
  const offline = status === "offline";

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[80] flex justify-center px-4"
    >
      <div
        className={cn(
          "pointer-events-auto flex max-w-full items-center gap-2.5 rounded-full border px-4 py-2 text-xs font-medium shadow-float backdrop-blur-md animate-in fade-in slide-in-from-bottom-2",
          offline
            ? "border-border bg-foreground text-background"
            : "border-success/25 bg-card text-success-strong",
        )}
      >
        {offline ? (
          <WifiOff className="size-3.5 shrink-0" aria-hidden />
        ) : (
          <Wifi className="size-3.5 shrink-0" aria-hidden />
        )}
        <span>
          {offline ? "Sem ligação — as alterações não ficam guardadas." : "Ligação restabelecida."}
        </span>
      </div>
    </div>
  );
}
