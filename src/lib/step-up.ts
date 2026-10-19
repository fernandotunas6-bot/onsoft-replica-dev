/**
 * Reconfirmação de identidade antes de acções críticas («modo sudo»).
 *
 * Quem já entrou não volta a ser interrompido a navegar. Só as acções que
 * desviam dinheiro ou dão poder a alguém (IBAN da escola, regras de cobrança,
 * ordens de pagamento, papéis de acesso) pedem uma confirmação recente: um
 * toque na chave de acesso, ou o código da aplicação autenticadora, ou a senha
 * em contas sem 2FA. Vale 15 minutos.
 *
 * O servidor decide pelo token: `amr` traz a hora de cada verificação real
 * (senha, código, chave de acesso). Renovar o token não a muda, por isso uma
 * sessão aberta há dias não passa por recente.
 */

export const STEP_UP_MAX_AGE_SECONDS = 15 * 60;

/** Prefixo das recusas; o ecrã reconhece-o e abre a confirmação. */
export const STEP_UP_PREFIX = "Confirme a sua identidade para continuar";

export const STEP_UP_REQUIRED_EVENT = "siga:step-up-required";

type AmrEntry = { method?: unknown; timestamp?: unknown };

/** Hora (segundos) da verificação mais recente registada no token, ou null. */
export function lastVerificationAt(claims: Record<string, unknown>): number | null {
  const amr = claims["amr"];
  if (!Array.isArray(amr)) return null;
  let latest: number | null = null;
  for (const entry of amr as AmrEntry[]) {
    if (!entry || typeof entry !== "object") continue;
    const at = Number(entry.timestamp);
    if (Number.isFinite(at) && at > 0 && (latest === null || at > latest)) latest = at;
  }
  return latest;
}

export function isRecentlyVerified(
  claims: Record<string, unknown>,
  nowSeconds = Math.floor(Date.now() / 1000),
  maxAgeSeconds = STEP_UP_MAX_AGE_SECONDS,
): boolean {
  const at = lastVerificationAt(claims);
  return at !== null && nowSeconds - at <= maxAgeSeconds;
}

/**
 * Servidor: recusa a acção se a última verificação tiver mais de 15 minutos.
 * Sem `amr` no token (caminho de recurso do middleware), falha fechada.
 * 403, não 401: a sessão é válida e não deve ser terminada.
 */
export function requireRecentVerification(
  claims: Record<string, unknown>,
  action: string,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  if (isRecentlyVerified(claims, nowSeconds)) return;
  throw Object.assign(new Error(`${STEP_UP_PREFIX}: ${action}.`), {
    statusCode: 403,
    stepUp: true,
  });
}

export function isStepUpRequiredMessage(message: string): boolean {
  return message.startsWith(STEP_UP_PREFIX);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : "";
}

/** O erro é uma recusa por falta de confirmação recente? */
export function isStepUpError(error: unknown): boolean {
  return isStepUpRequiredMessage(errorMessage(error));
}

/** Cliente: se o erro for de reconfirmação, abre o diálogo e devolve true. */
export function reportPossibleStepUp(error: unknown): boolean {
  const message = errorMessage(error);
  if (!isStepUpRequiredMessage(message)) return false;
  if (typeof window !== "undefined") {
    const action = message.slice(STEP_UP_PREFIX.length).replace(/^:\s*/, "").replace(/\.$/, "");
    window.dispatchEvent(new CustomEvent(STEP_UP_REQUIRED_EVENT, { detail: { action } }));
  }
  return true;
}
