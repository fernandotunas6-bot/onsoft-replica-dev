import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { discardOutboxItem, flushOutbox, useOutbox } from "@/lib/offline/outbox";
import { currentUserId } from "@/lib/offline/outbox-session";
import { enableDesktopPagesOffline } from "@/lib/offline/desktop-offline";
import { ACTIVE_SCHOOL_CHANGED_EVENT, readStoredActiveSchool } from "@/features/auth/active-school";

/**
 * Envia a fila de envio sem rede (app desktop): ao entrar, quando a rede volta e de
 * minuto a minuto enquanto houver envios à espera. Só existe com sessão iniciada (fica
 * dentro do AuthGate). Um envio recusado pelo servidor fica num aviso até ser
 * descartado.
 */
export function OfflineOutboxSync() {
  const queryClient = useQueryClient();
  const { waiting, failed, legacy } = useOutbox();
  const legacyWarned = useRef(false);
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

  useEffect(() => {
    if (legacy.length === 0) {
      legacyWarned.current = false;
      return;
    }
    if (legacyWarned.current) return;
    legacyWarned.current = true;
    toast.warning("Existem lançamentos antigos sem escola identificada.", {
      description:
        "Estão preservados neste computador e não serão enviados automaticamente. Peça assistência para validar a escola de origem.",
      duration: Infinity,
    });
  }, [legacy.length]);

  // Terminar sessão apaga as caches do SIGA: ao voltar a entrar, a app desktop volta a
  // guardar as páginas para abrir sem rede.
  useEffect(() => void enableDesktopPagesOffline(), []);

  useEffect(() => {
    if (waiting === 0) return;
    let active = true;
    const flush = async () => {
      if (!active || navigator.onLine === false) return;
      await flushOutbox(await currentUserId(), readStoredActiveSchool());
      // O que chegou ao servidor tem de aparecer nos ecrãs.
      void queryClient.invalidateQueries({ queryKey: ["attendance-sheet"] });
      void queryClient.invalidateQueries({ queryKey: ["academic", "pedagogical-workspace"] });
    };
    void flush();
    window.addEventListener("online", flush);
    window.addEventListener(ACTIVE_SCHOOL_CHANGED_EVENT, flush);
    const timer = window.setInterval(flush, 60_000);
    return () => {
      active = false;
      window.removeEventListener("online", flush);
      window.removeEventListener(ACTIVE_SCHOOL_CHANGED_EVENT, flush);
      window.clearInterval(timer);
    };
  }, [waiting, queryClient]);

  useEffect(() => {
    for (const item of failed) {
      if (shown.current.has(item.id)) continue;
      shown.current.add(item.id);
      const uncertain = item.deliveryState === "needs_verification";
      const options = {
        description: `${item.failedReason} Guardado neste posto a ${new Date(item.createdAt).toLocaleString("pt-PT")}.`,
        duration: Infinity,
      };
      if (uncertain) {
        // Sem botão de descarte para não perder um lançamento que pode ter
        // sido aplicado remotamente. Exige revisão da secretaria.
        toast.warning(`Confirmar lançamento: ${item.label}`, options);
      } else {
        toast.error(`Não enviado: ${item.label}`, {
          ...options,
          action: { label: "Descartar", onClick: () => void discardOutboxItem(item.id) },
        });
      }
    }
  }, [failed]);

  return null;
}
