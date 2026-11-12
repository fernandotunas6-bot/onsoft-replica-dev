import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { SESSION_MFA_REQUIRED } from "@/integrations/supabase/session-mfa";

const FLAG_KEY = "siga:session-expired";
export const SESSION_EXPIRED_MESSAGE =
  "A sua sessão expirou. Inicie sessão novamente para continuar.";

const AUTH_ERROR_PATTERN =
  /(^|\b)unauthorized\b|jwt expired|invalid jwt|refresh token|sessão (em falta|inválida|expirada)|não autenticado|auth session missing/i;

export function isSessionError(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof Response) return error.status === 401;
  const status =
    (error as { status?: number; statusCode?: number }).status ??
    (error as { statusCode?: number }).statusCode;
  if (status === 401) return true;
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return AUTH_ERROR_PATTERN.test(message);
}

/** Conta com 2FA numa sessão aal1: só se resolve a entrar de novo com o código. */
function needsNewSignIn(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return message.includes(SESSION_MFA_REQUIRED);
}

type AuthClient = Pick<typeof supabase.auth, "getSession" | "getUser" | "refreshSession">;

/**
 * Um 401 não prova que a sessão morreu: o token pode ter caducado durante a
 * suspensão do computador, a renovação pode ter falhado por falta de rede, ou o
 * servidor pode não ter chegado ao Auth do Supabase (fecha por segurança). Antes
 * de terminar a sessão — e com ela o 2FA de todos os painéis, que partilham o
 * cookie — pergunta-se ao Auth. Só sai se o Auth recusar a sessão de facto
 * (revogada, senha mudada, «terminar em todos os dispositivos»).
 */
export async function sessionIsGone(auth: AuthClient = supabase.auth): Promise<boolean> {
  const { data, error } = await auth.getSession();
  if (error) return !isAuthRetryableFetchError(error);
  if (!data.session) return true;
  const { error: userError } = await auth.getUser();
  if (!userError || isAuthRetryableFetchError(userError)) return false;
  const { error: refreshError } = await auth.refreshSession();
  return Boolean(refreshError) && !isAuthRetryableFetchError(refreshError);
}

let handling: Promise<boolean> | null = null;

/**
 * Termina a sessão local se ela já não for válida; o AuthGate mostra o ecrã de
 * entrada com a mensagem. Devolve `false` quando a sessão continua viva. Vários
 * erros ao mesmo tempo partilham a mesma verificação.
 */
export function handleSessionExpired(error?: unknown): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(true);
  handling ??= (async () => {
    if (!needsNewSignIn(error) && !(await sessionIsGone().catch(() => false))) return false;
    try {
      sessionStorage.setItem(FLAG_KEY, "1");
    } catch {
      // ignore
    }
    await supabase.auth.signOut({ scope: "local" });
    return true;
  })().finally(() => {
    handling = null;
  });
  return handling;
}

export function consumeSessionExpiredFlag(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const had = sessionStorage.getItem(FLAG_KEY) === "1";
    sessionStorage.removeItem(FLAG_KEY);
    return had;
  } catch {
    return false;
  }
}

/** Reage a erros de sessão em qualquer sítio: devolve true se tratou o erro. */
export function reportPossibleSessionError(error: unknown): boolean {
  if (!isSessionError(error)) return false;
  void handleSessionExpired(error);
  return true;
}
