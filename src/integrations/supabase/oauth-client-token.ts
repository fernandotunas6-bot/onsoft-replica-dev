/**
 * Tokens de aplicações ligadas por OAuth (agentes de IA, `/mcp`) não abrem o SIGA.
 *
 * O servidor OAuth do Supabase emite, a cada aplicação que a pessoa autoriza, um JWT
 * normal do projecto (`role: authenticated`) com a claim `client_id`
 * (https://supabase.com/docs/guides/auth/oauth-server/token-security). Sem esta
 * verificação, esse token valia o mesmo que a sessão da pessoa em todas as server
 * functions e APIs — incluindo escritas — apesar de o consentimento dizer só
 * «consultar» (análise 22, P2-1). O `/mcp` continua a aceitá-los: as ferramentas são de
 * leitura e correm com a RLS da pessoa (`src/lib/mcp/supabase.ts`).
 *
 * A decisão lê o payload sem verificar a assinatura. É seguro porque só serve para
 * RECUSAR: um token forjado com `client_id` é recusado aqui; um forjado sem ela continua a
 * ter de passar a validação do Supabase a seguir.
 */
export const OAUTH_CLIENT_TOKEN_REFUSED =
  "Unauthorized: o acesso de uma aplicação ligada (OAuth) não abre o SIGA. Entre com a sua conta.";

function decodePayload(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const normalized = payload.replaceAll("-", "+").replaceAll("_", "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const parsed = JSON.parse(atob(padded)) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** `client_id` do token, quando foi emitido a uma aplicação OAuth; `null` numa sessão normal. */
export function oauthClientIdOf(token: string): string | null {
  const clientId = decodePayload(token)?.["client_id"];
  return typeof clientId === "string" && clientId.trim() ? clientId.trim() : null;
}

/** O token foi emitido a uma aplicação OAuth (e não à pessoa, no SIGA)? */
export function isOAuthClientToken(token: string): boolean {
  return oauthClientIdOf(token) !== null;
}
