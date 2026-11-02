/**
 * Limite de tentativas partilhado por todas as instâncias do servidor
 * (`siga_rate_limit_consume`, migração 20260927170000).
 *
 * Verifica e regista numa só operação. As chaves são transformadas com SHA-256
 * antes de ir para a base (hash sem chave, não cifragem nem anonimização forte).
 * Se a função ainda não existir ou a base não responder, cai no limitador em
 * memória (`rate-limit.ts`) — um limite mais fraco, mas nunca nenhum.
 */
import { checkRateLimit, recordRateLimitAttempt, type RateLimitOptions } from "./rate-limit";

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

type Consume = (keyHashes: string[], windowSeconds: number, max: number) => Promise<boolean | null>;

// A função PostgreSQL recebe inteiros signed de 32 bits. Nunca enviar valores
// inválidos: a RPC antiga devolve true se max_hits < 1 (fail-open).
const POSTGRES_INT_MAX = 2_147_483_647;

function validLimitOptions(options: RateLimitOptions): boolean {
  if (!Number.isSafeInteger(options.windowMs) || options.windowMs <= 0) return false;
  if (!Number.isSafeInteger(options.max) || options.max <= 0) return false;
  return Math.ceil(options.windowMs / 1000) <= POSTGRES_INT_MAX &&
    options.max <= POSTGRES_INT_MAX;
}

/**
 * Apenas um aviso por isolado a cada 5 minutos, sem IP, e-mail, chaves,
 * hashes, tokens ou detalhes de erros da base. Um aviso de log NÃO equivale
 * a monitorização nem alerta configurado no Cloudflare: ligar alertas
 * externos antes de considerar esta falha operacionalmente coberta.
 */
const SHARED_LIMIT_WARNING_INTERVAL_MS = 5 * 60_000;
let lastSharedLimitWarningAt = Number.NEGATIVE_INFINITY;

function reportSharedLimitUnavailable(): void {
  const now = Date.now();
  if (now - lastSharedLimitWarningAt < SHARED_LIMIT_WARNING_INTERVAL_MS) return;
  lastSharedLimitWarningAt = now;
  console.warn("security.rate_limit.shared_unavailable", {
    fallback: "local",
    alert: "Configure monitoring for repeated failures",
  });
}

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
  if (!validLimitOptions(options)) return false;
  if (!keys.length) return true;
  // A base já deduplica no INSERT; fazer o mesmo antes do RPC evita bloqueios
  // advisory repetidos e mantém paridade com o fallback por isolado.
  const uniqueKeys = [...new Set(keys)];
  const hashes = await Promise.all(uniqueKeys.map((k) => sha256Hex(k)));
  const shared = await consume(hashes, Math.ceil(options.windowMs / 1000), options.max);
  if (shared !== null) return shared;
  reportSharedLimitUnavailable();
  if (!checkRateLimit(keys, options)) return false;
  recordRateLimitAttempt(keys, options);
  return true;
}
