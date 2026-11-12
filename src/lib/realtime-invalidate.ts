import type { QueryClient, QueryKey } from "@tanstack/react-query";

/**
 * Junta as invalidações que chegam pelo tempo real.
 *
 * Cada linha escrita chega como um evento. Uma importação de alunos, a geração
 * das propinas do mês ou uma mudança de estado em lote escrevem centenas de
 * linhas de uma vez e, sem isto, cada ecrã aberto pedia a lista e o painel ao
 * servidor uma vez por linha. O primeiro evento abre uma janela curta; as
 * chaves pedidas durante a janela são invalidadas uma só vez no fim.
 */
export function realtimeInvalidator(queryClient: QueryClient, windowMs = 300) {
  const pending = new Map<string, QueryKey>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let flushing = false;
  let disposed = false;

  const schedule = () => {
    if (!disposed && !flushing && pending.size && timer === undefined) {
      timer = setTimeout(flush, windowMs);
    }
  };

  const flush = () => {
    timer = undefined;
    if (disposed) return;
    flushing = true;
    const queryKeys = [...pending.values()];
    pending.clear();
    // Eventos durante uma leitura lenta ficam para a próxima actualização:
    // não cancelar e recomeçar o mesmo pedido a cada janela.
    void Promise.allSettled(
      queryKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    ).finally(() => {
      flushing = false;
      schedule();
    });
  };

  return {
    invalidate(...queryKeys: QueryKey[]) {
      if (disposed) return;
      for (const queryKey of queryKeys) pending.set(JSON.stringify(queryKey), queryKey);
      schedule();
    },
    /** Ao sair do ecrã: o que ficou por invalidar já não interessa. */
    dispose() {
      disposed = true;
      clearTimeout(timer);
      timer = undefined;
      pending.clear();
    },
  };
}
