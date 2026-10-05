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

  const flush = () => {
    timer = undefined;
    const queryKeys = [...pending.values()];
    pending.clear();
    for (const queryKey of queryKeys) void queryClient.invalidateQueries({ queryKey });
  };

  return {
    invalidate(...queryKeys: QueryKey[]) {
      for (const queryKey of queryKeys) pending.set(JSON.stringify(queryKey), queryKey);
      timer ??= setTimeout(flush, windowMs);
    },
    /** Ao sair do ecrã: o que ficou por invalidar já não interessa. */
    dispose() {
      clearTimeout(timer);
      timer = undefined;
      pending.clear();
    },
  };
}
