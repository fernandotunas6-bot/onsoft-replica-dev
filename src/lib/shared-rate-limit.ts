/**
 * Limite de tentativas partilhado por todas as instâncias do servidor
 * (`siga_rate_limit_consume`, migração 20260927170000).
 *
 * Verifica e regista numa só operação. As chaves vão cifradas (SHA-256): a base
 * nunca guarda IPs nem identificadores em claro. Se a função ainda não existir
 * ou a base não responder, cai no limitador em memória (`rate-limit.ts`) — um
 * limite mais fraco, mas nunca nenhum.
 */
import { checkRateLimit, recordRateLimitAttempt, type RateLimitOptions } from "./rate-limit";

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

type Consume = (keyHashes: string[], windowSeconds: number, max: number) => Promise<boolean | null>;

/** Chamada à base; `null` quando não é possível usar o contador partilhado. */
const consumeInDatabase: Consume = async (keyHashes, windowSeconds, max) => {
  try {
    const { loadSgaAdminClient } = await import("@/integrations/supabase/sga-admin");
    const db = await loadSgaAdminClient();
    const { data, error } = await db.rpc(
      "siga_rate_limit_consume" as never,
      {
        key_hashes: keyHashes,
        window_seconds: windowSeconds,
        max_hits: max,
      } as never,
    );
    if (error || typeof data !== "boolean") return null;
    return data;
  } catch {
    return null;
  }
};

/**
 * `true` se todas as chaves estão dentro do limite (e a tentativa fica
 * registada); `false` se alguma já o atingiu.
 */
export async function consumeRateLimit(
  keys: readonly string[],
  options: RateLimitOptions,
  consume: Consume = consumeInDatabase,
): Promise<boolean> {
  if (!keys.length) return true;
  const hashes = await Promise.all(keys.map((k) => sha256Hex(k)));
  const shared = await consume(hashes, Math.ceil(options.windowMs / 1000), options.max);
  if (shared !== null) return shared;
  if (!checkRateLimit(keys, options)) return false;
  recordRateLimitAttempt(keys, options);
  return true;
}
