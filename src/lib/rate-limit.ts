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
/**
 * A protecção principal é a RPC partilhada. Este fallback só opera quando
 * essa RPC está indisponível: restringe a memória por isolado para não permitir
 * que IPs/identificadores distintos causem crescimento ilimitado.
 *
 * Quando a capacidade do fallback é atingida, novas chaves são recusadas
 * (fail-closed). Isto pode limitar utilizadores legítimos durante um ataque
 * massivo: monitorizar saturação e recuperar o contador partilhado é prioritário.
 */
export const MAX_LOCAL_RATE_LIMIT_KEYS = 50_000;
const SWEEP_INTERVAL_MS = 60_000;

type RateLimitEntry = { attempts: number[]; windowMs: number };
const attemptsByKey = new Map<string, RateLimitEntry>();
let lastSweepAt = 0;

export interface RateLimitOptions {
  /** Duração da janela deslizante, em milissegundos. */
  windowMs: number;
  /** Número máximo de tentativas permitidas dentro da janela, por chave. */
  max: number;
}

function sweepExpired(now: number): void {
  // Mesmo com a capacidade esgotada, não percorrer 50 000 chaves a cada
  // pedido abusivo: uma limpeza completa é limitada a uma por minuto.
  if (now >= lastSweepAt && now - lastSweepAt < SWEEP_INTERVAL_MS) return;
  for (const [key, entry] of attemptsByKey) {
    if (entry.attempts.every((time) => now - time >= entry.windowMs)) {
      attemptsByKey.delete(key);
    }
  }
  lastSweepAt = now;
}

/** Retira tentativas antigas da chave sem alterar o resultado do limite. */
function liveAttempts(key: string, now: number, windowMs: number): number[] {
  const current = attemptsByKey.get(key);
  if (!current) return [];
  const valid = current.attempts.filter((time) => now - time < windowMs);
  if (!valid.length) attemptsByKey.delete(key);
  return valid;
}

/** Verdadeiro apenas se TODAS as chaves ainda estiverem dentro do limite. */
export function checkRateLimit(keys: readonly string[], options: RateLimitOptions): boolean {
  // Sem uma chave, nada é contado: negar a tentativa, não abrir o limite.
  if (keys.length === 0) return false;
  if (!Number.isSafeInteger(options.windowMs) || options.windowMs <= 0) return false;
  if (!Number.isSafeInteger(options.max) || options.max <= 0) return false;
  const now = Date.now();
  sweepExpired(now);
  let newKeys = 0;
  for (const key of new Set(keys)) {
    const attempts = liveAttempts(key, now, options.windowMs);
    if (attempts.length >= options.max) return false;
    if (!attemptsByKey.has(key)) newKeys += 1;
  }
  if (attemptsByKey.size + newKeys > MAX_LOCAL_RATE_LIMIT_KEYS) {
    sweepExpired(now);
  }
  return attemptsByKey.size + newKeys <= MAX_LOCAL_RATE_LIMIT_KEYS;
}

/** Regista uma tentativa em cada chave (chamar só depois de `checkRateLimit` passar). */
export function recordRateLimitAttempt(
  keys: readonly string[],
  options: Pick<RateLimitOptions, "windowMs">,
): void {
  const now = Date.now();
  sweepExpired(now);
  for (const key of new Set(keys)) {
    const attempts = liveAttempts(key, now, options.windowMs);
    if (!attemptsByKey.has(key) && attemptsByKey.size >= MAX_LOCAL_RATE_LIMIT_KEYS) {
      // Nunca exceder o tecto, mesmo se outro consumidor ignorar checkRateLimit.
      sweepExpired(now);
      if (attemptsByKey.size >= MAX_LOCAL_RATE_LIMIT_KEYS) return;
    }
    attempts.push(now);
    attemptsByKey.set(key, { attempts, windowMs: options.windowMs });
  }
}

/**
 * Bypass apenas em execução local explicitamente de teste/desenvolvimento.
 * No runtime Worker NODE_ENV pode estar ausente: "não production" NÃO é
 * prova de ambiente seguro e nunca deve aceitar uma chave fornecida pelo
 * cliente com o sufixo siga-plus.test como permissão de bypass.
 */
export function isRateLimitBypassed(...contextValues: string[]): boolean {
  if (process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test") {
    return false;
  }
  return (
    process.env.SIGA_E2E_LIVE === "1" ||
    process.env.SIGA_E2E_LIVE === "true" ||
    contextValues.some((value) => value.includes("siga-plus.test"))
  );
}
