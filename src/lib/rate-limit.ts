/**
 * Limitador de taxa em memória, por processo — janela deslizante simples.
 * Extraído de `src/features/saas/public-signup.ts` para ser reutilizado nos
 * outros pontos de entrada públicos sem sessão (magic link, recuperação de
 * password, webhooks de pagamento) que antes não tinham nenhum limite.
 *
 * Nota de arquitectura: isto vive na memória do isolado/processo, não numa
 * base de dados partilhada — em Cloudflare Workers cada isolado tem o seu
 * próprio mapa, por isso o limite real "por chave" pode ser maior do que o
 * configurado se houver vários isolados atrás do mesmo hostname. Ainda assim
 * é uma primeira barreira eficaz contra abuso automatizado num único pedido
 * repetido, muito melhor do que nenhum limite. Uma solução multi-isolado
 * exigiria um contador partilhado (KV/D1/Postgres) — fora de âmbito aqui.
 */
const attemptsByKey = new Map<string, number[]>();

export interface RateLimitOptions {
  /** Duração da janela deslizante, em milissegundos. */
  windowMs: number;
  /** Número máximo de tentativas permitidas dentro da janela, por chave. */
  max: number;
}

/** Verdadeiro apenas se TODAS as chaves ainda estiverem dentro do limite. */
export function checkRateLimit(keys: readonly string[], options: RateLimitOptions): boolean {
  const now = Date.now();
  return keys.every((key) => {
    const attempts = (attemptsByKey.get(key) ?? []).filter((t) => now - t < options.windowMs);
    return attempts.length < options.max;
  });
}

/** Regista uma tentativa em cada chave (chamar só depois de `checkRateLimit` passar). */
export function recordRateLimitAttempt(
  keys: readonly string[],
  options: Pick<RateLimitOptions, "windowMs">,
): void {
  const now = Date.now();
  for (const key of keys) {
    const attempts = (attemptsByKey.get(key) ?? []).filter((t) => now - t < options.windowMs);
    attempts.push(now);
    attemptsByKey.set(key, attempts);
  }
}

/** Bypass consistente para execuções e2e/CI — em produção, nunca aceita bypass por input do cliente. */
export function isRateLimitBypassed(...contextValues: string[]): boolean {
  if (process.env.NODE_ENV === "production") {
    return false;
  }
  return (
    process.env.SIGA_E2E_LIVE === "1" ||
    process.env.SIGA_E2E_LIVE === "true" ||
    contextValues.some((value) => value.includes("siga-plus.test"))
  );
}
