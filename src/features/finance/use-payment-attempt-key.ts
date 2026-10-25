import { useCallback, useRef } from "react";

/**
 * Chave de idempotência por tentativa de pagamento.
 *
 * Repetir o mesmo pagamento — mesma fatura, valor, método e data — reenvia a mesma
 * chave, e o servidor devolve o recibo que já entrou em vez de emitir outro. Mudar
 * qualquer um desses campos é outro pagamento e recebe chave nova. Depois de aceite,
 * a chave é descartada: pagar outra prestação igual no mesmo dia é legítimo.
 */
export function usePaymentAttemptKey() {
  const keys = useRef(new Map<string, string>());
  const keyFor = useCallback((attempt: string) => {
    let key = keys.current.get(attempt);
    if (!key) {
      key = crypto.randomUUID();
      keys.current.set(attempt, key);
    }
    return key;
  }, []);
  const settled = useCallback((attempt: string) => {
    keys.current.delete(attempt);
  }, []);
  return { keyFor, settled };
}
