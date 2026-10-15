import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { discardOutboxItem, flushOutbox, useOutbox } from "@/lib/offline/outbox";
import { currentUserId } from "@/lib/offline/outbox-session";
import { enableDesktopPagesOffline } from "@/lib/offline/desktop-offline";

/**
 * Envia a fila de envio sem rede (app desktop): ao entrar, quando a rede volta e de
 * minuto a minuto enquanto houver envios à espera. Só existe com sessão iniciada (fica
 * dentro do AuthGate). Um envio recusado pelo servidor fica num aviso até ser
 * descartado.
 */
export function OfflineOutboxSync() {
  const queryClient = useQueryClient();
  const { waiting, failed } = useOutbox();
  const shown = useRef(new Set<string>());
  const hadWaiting = useRef(0);

  // A fila esvaziou depois de enviar: confirmar que chegou ao servidor.
  useEffect(() => {
    if (hadWaiting.current > 0 && waiting === 0 && failed.length === 0) {
      toast.success("Enviado para o SIGA", {
        description: "O que ficou guardado neste computador sem rede já está no servidor.",
      });
    }
    hadWaiting.current = waiting;
  }, [waiting, failed.length]);

  // Terminar sessão apaga as caches do SIGA: ao voltar a entrar, a app desktop volta a
  // guardar as páginas para abrir sem rede.
  useEffect(() => void enableDesktopPagesOffline(), []);

  useEffect(() => {
    if (waiting === 0) return;
    let active = true;
    const flush = async () => {
      if (!active || navigator.onLine === false) return;
      await flushOutbox(await currentUserId());
      // O que chegou ao servidor tem de aparecer nos ecrãs.
      void queryClient.invalidateQueries({ queryKey: ["attendance-sheet"] });
      void queryClient.invalidateQueries({ queryKey: ["academic", "pedagogical-workspace"] });
    };
    void flush();
    window.addEventListener("online", flush);
    const timer = window.setInterval(flush, 60_000);
    return () => {
      active = false;
      window.removeEventListener("online", flush);
      window.clearInterval(timer);
    };
  }, [waiting, queryClient]);

  useEffect(() => {
    for (const item of failed) {
      if (shown.current.has(item.id)) continue;
      shown.current.add(item.id);
      toast.error(`Não enviado: ${item.label}`, {
        description: `${item.failedReason} Guardado sem rede a ${new Date(item.createdAt).toLocaleString("pt-PT")}.`,
        duration: Infinity,
        action: { label: "Descartar", onClick: () => void discardOutboxItem(item.id) },
      });
    }
  }, [failed]);

  return null;
}
