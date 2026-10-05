import { useSyncExternalStore } from "react";
import type { QueryClient } from "@tanstack/react-query";

/**
 * Gravações à espera de rede.
 *
 * Sem rede, o TanStack Query (modo `online`, o de omissão) põe as mutações em pausa e
 * envia-as sozinho quando a rede volta. Mas só em memória: recarregar ou fechar o SIGA
 * perde-as, e ninguém sabia que estavam à espera. Isto conta-as para o aviso de ligação
 * e para pedir confirmação antes de sair.
 */
export function pendingWriteCount(queryClient: QueryClient) {
  return queryClient
    .getMutationCache()
    .getAll()
    .filter((mutation) => mutation.state.status === "pending").length;
}

/** Quantas estão paradas por falta de rede (ainda não saíram). */
export function pausedWriteCount(queryClient: QueryClient) {
  return queryClient
    .getMutationCache()
    .getAll()
    .filter((mutation) => mutation.state.status === "pending" && mutation.state.isPaused).length;
}

/** `{ paused, pending }`, actualizado a cada mudança na cache de mutações. */
export function usePendingWrites(queryClient: QueryClient) {
  const snapshot = useSyncExternalStore(
    (onChange) => queryClient.getMutationCache().subscribe(onChange),
    () => `${pausedWriteCount(queryClient)}:${pendingWriteCount(queryClient)}`,
    () => "0:0",
  );
  const [paused = 0, pending = 0] = snapshot.split(":").map(Number);
  return { paused, pending };
}

/** Texto do aviso: "1 alteração" / "3 alterações". */
export function writesLabel(count: number) {
  return count === 1 ? "1 alteração" : `${count} alterações`;
}
