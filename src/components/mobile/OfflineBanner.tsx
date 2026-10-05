import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CloudOff, LoaderCircle, Wifi } from "lucide-react";

import { useOnlineStatus } from "@/hooks/use-breakpoint";
import { notifyInBackground } from "@/lib/desktop-notifications";
import { usePendingWrites, writesLabel } from "@/lib/pending-writes";
import { cn } from "@/lib/utils";

type Phase = "online" | "offline" | "back";

/**
 * Estado da ligação (§46). O SIGA é uma PWA usada em escolas com rede
 * intermitente: sem este aviso, um formulário que falha a gravar parece um bug
 * da aplicação em vez de falta de rede.
 *
 * Sem rede, as gravações feitas com `useMutation` ficam à espera e seguem quando
 * a rede volta — mas só enquanto o SIGA estiver aberto. Por isso o aviso diz
 * quantas estão à espera, mostra "A enviar…" quando a rede volta e confirma
 * "Alterações enviadas"; fechar ou recarregar com gravações por enviar pede
 * confirmação. Quando a ligação volta sem nada pendente, mostra-se "restaurada"
 * por três segundos e desaparece — um aviso permanente de sucesso é ruído.
 */
export function OfflineBanner() {
  const queryClient = useQueryClient();
  const { paused, pending } = usePendingWrites(queryClient);
  const { online } = useOnlineStatus();
  const [phase, setPhase] = React.useState<Phase>("online");
  const [sent, setSent] = React.useState(false);
  const wasOnline = React.useRef(true);
  const hadPending = React.useRef(false);

  React.useEffect(() => {
    if (!online) setPhase("offline");
    else if (!wasOnline.current) setPhase("back");
    wasOnline.current = online;
  }, [online]);

  // De volta à rede: "A enviar…" enquanto houver gravações pendentes; quando
  // acabam, confirma e desaparece 3 s depois.
  React.useEffect(() => {
    if (phase === "offline") {
      if (paused > 0) hadPending.current = true;
      return;
    }
    if (phase !== "back") return;
    if (pending > 0) {
      hadPending.current = true;
      return;
    }
    setSent(hadPending.current);
    // Na app desktop em segundo plano, avisa também pelo sistema (fim do envio).
    if (hadPending.current) {
      void notifyInBackground("Alterações enviadas", "O que gravou sem rede já está no SIGA.");
    }
    hadPending.current = false;
    const timer = window.setTimeout(() => {
      setPhase("online");
      setSent(false);
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [phase, paused, pending]);

  // Recarregar ou fechar com gravações que ainda não saíram perde-as.
  React.useEffect(() => {
    if (paused === 0) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [paused]);

  if (phase === "online") return null;
  const offline = phase === "offline";
  const sending = phase === "back" && pending > 0;

  let text: string;
  if (offline) {
    text =
      paused > 0
        ? `Sem ligação — ${writesLabel(paused)} à espera. São enviadas quando a rede voltar; não feche o SIGA.`
        : "Sem ligação — algumas funções estão limitadas e as alterações podem não gravar.";
  } else if (sending) {
    text = `A enviar ${writesLabel(pending)}…`;
  } else {
    text = sent ? "Alterações enviadas." : "Ligação restaurada.";
  }
  const Icon = offline ? CloudOff : sending ? LoaderCircle : sent ? CheckCircle2 : Wifi;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center gap-2 px-4 py-1.5 text-[11px]",
        offline
          ? "bg-warning/15 text-warning-strong"
          : sending
            ? "bg-muted text-foreground"
            : "bg-success/10 text-success-strong",
      )}
    >
      <Icon className={cn("size-3.5 shrink-0", sending && "animate-spin")} aria-hidden />
      <span className="min-w-0">{text}</span>
    </div>
  );
}
