import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "@tanstack/react-router";
import { confirmDiscardChanges } from "@/components/ui/modal-system/confirm-close";

/**
 * Aviso de alterações não guardadas num ecrã de página (os modais já o têm em
 * `ModalShell`/`QuickFormModal`). Enquanto `dirty`:
 *  - navegar dentro do SIGA pede confirmação;
 *  - fechar ou recarregar o separador mostra o aviso do navegador.
 *
 * Devolve `confirmLeave()`, para mudanças dentro do próprio ecrã que deitam
 * fora o que foi escrito (trocar de turma, disciplina ou período).
 */
export function useUnsavedChangesGuard(dirty: boolean) {
  // Sem router (testes, ecrãs públicos) fica só o aviso do navegador.
  const router = useRouter({ warn: false });
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  useEffect(() => {
    if (!dirty) return;
    if (router) {
      return router.history.block({
        blockerFn: () => !confirmDiscardChanges(dirtyRef.current),
        enableBeforeUnload: () => dirtyRef.current,
      });
    }
    const prevent = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty, router]);

  return useCallback(() => confirmDiscardChanges(dirtyRef.current), []);
}
