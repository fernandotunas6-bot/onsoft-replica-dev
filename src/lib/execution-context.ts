/**
 * Mantém vivo trabalho que não deve atrasar a resposta (alertas operacionais).
 *
 * No Cloudflare Workers, uma promessa que ninguém espera pode ser cancelada assim
 * que a resposta sai — um `void fetch(...)` de alerta perdia-se em silêncio. O
 * `src/server.ts` instala aqui o `ctx.waitUntil` de cada pedido; fora do Worker
 * (testes, browser) o gancho não existe e a promessa corre como antes.
 */
type KeepAlive = (promise: Promise<unknown>) => void;

const HOOK = "__sigaKeepAlive";

export function installKeepAlive(hook: KeepAlive): void {
  (globalThis as Record<string, unknown>)[HOOK] = hook;
}

export function keepAlive(promise: Promise<unknown>): void {
  const hook = (globalThis as Record<string, unknown>)[HOOK] as KeepAlive | undefined;
  try {
    hook?.(promise);
  } catch {
    // Sem contexto de pedido (ex.: fora de um fetch): a promessa segue sozinha.
  }
}

/**
 * ID de correlação do pedido em curso (`request-id.ts`). O `src/server.ts`
 * instala a fonte; no browser e nos testes não há pedido e devolve `null`.
 */
type RequestIdSource = () => string | null | undefined;

const REQUEST_ID_HOOK = "__sigaRequestId";

export function installRequestIdSource(source: RequestIdSource): void {
  (globalThis as Record<string, unknown>)[REQUEST_ID_HOOK] = source;
}

export function currentRequestId(): string | null {
  const source = (globalThis as Record<string, unknown>)[REQUEST_ID_HOOK] as
    RequestIdSource | undefined;
  try {
    return source?.() ?? null;
  } catch {
    return null;
  }
}
