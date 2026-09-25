import { supabase } from "@/integrations/supabase/client";

const FLAG_KEY = "siga:session-expired";
export const SESSION_EXPIRED_MESSAGE = "A sua sessão expirou. Inicie sessão novamente para continuar.";

const AUTH_ERROR_PATTERN =
  /(^|\b)unauthorized\b|jwt expired|invalid jwt|refresh token|sessão (em falta|inválida|expirada)|não autenticado|auth session missing/i;

export function isSessionError(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof Response) return error.status === 401;
  const status = (error as { status?: number; statusCode?: number }).status ??
    (error as { statusCode?: number }).statusCode;
  if (status === 401) return true;
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return AUTH_ERROR_PATTERN.test(message);
}

let handling = false;

/** Termina a sessão local; o AuthGate mostra o ecrã de entrada com a mensagem. */
export function handleSessionExpired() {
  if (typeof window === "undefined" || handling) return;
  handling = true;
  try {
    sessionStorage.setItem(FLAG_KEY, "1");
  } catch {
    // ignore
  }
  void supabase.auth.signOut({ scope: "local" }).finally(() => {
    handling = false;
  });
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
  handleSessionExpired();
  return true;
}
