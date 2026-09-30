import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, LoaderCircle, Wifi, WifiOff } from "lucide-react";
import { usePendingWrites, writesLabel } from "@/lib/pending-writes";
import { cn } from "@/lib/utils";

type Status = "online" | "offline" | "back";

/**
 * Aviso discreto de ligação (app desktop, PWA e browser): uma pílula em baixo, ao centro.
 *
 * Sem rede, as gravações ficam à espera (TanStack Query) e seguem quando a rede volta —
 * mas só enquanto o SIGA estiver aberto. Por isso o aviso diz quantas estão à espera,
 * mostra "A enviar…" quando a rede volta, confirma "Alterações enviadas", e o browser
 * pede confirmação antes de recarregar ou fechar com gravações por enviar.
 */
export function ConnectionStatus() {
  const queryClient = useQueryClient();
  const { paused, pending } = usePendingWrites(queryClient);
  const [status, setStatus] = useState<Status>("online");
  const [sent, setSent] = useState(false);
  const hadPending = useRef(false);
  const timer = useRef<number>(0);

  useEffect(() => {
    if (!navigator.onLine) setStatus("offline");
    const goOffline = () => {
      window.clearTimeout(timer.current);
      setStatus("offline");
    };
    const goOnline = () => setStatus("back");
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.clearTimeout(timer.current);
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  // De volta à rede: fica a mostrar "A enviar…" enquanto houver gravações pendentes;
  // quando acabam, confirma e desaparece 3 s depois.
  useEffect(() => {
    if (status === "offline") {
      if (paused > 0) hadPending.current = true;
      return;
    }
    if (status !== "back") return;
    if (pending > 0) {
      hadPending.current = true;
      window.clearTimeout(timer.current);
      return;
    }
    setSent(hadPending.current);
    hadPending.current = false;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setStatus("online");
      setSent(false);
    }, 3000);
  }, [status, paused, pending]);

  // Recarregar ou fechar com gravações que ainda não saíram perde-as.
  useEffect(() => {
    if (paused === 0) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [paused]);

  if (status === "online") return null;
  const offline = status === "offline";
  const sending = status === "back" && pending > 0;

  let text: string;
  if (offline) {
    text =
      paused > 0
        ? `Sem ligação — ${writesLabel(paused)} à espera. São enviadas quando a rede voltar; não feche o SIGA.`
        : "Sem ligação — pode consultar o que já abriu. O que gravar fica à espera da rede.";
  } else if (sending) {
    text = `A enviar ${writesLabel(pending)}…`;
  } else {
    text = sent ? "Alterações enviadas." : "Ligação restabelecida.";
  }

  const Icon = offline ? WifiOff : sending ? LoaderCircle : sent ? CheckCircle2 : Wifi;

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
            : sending
              ? "border-border bg-card text-foreground"
              : "border-success/25 bg-card text-success-strong",
        )}
      >
        <Icon className={cn("size-3.5 shrink-0", sending && "animate-spin")} aria-hidden />
        <span>{text}</span>
      </div>
    </div>
  );
}
