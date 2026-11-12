/**
 * 2FA na sessão, não só nas tabelas do dinheiro.
 *
 * O Supabase emite um token aal1 depois da senha, mesmo com factores inscritos.
 * Para quem optar pela confirmação no login, o ecrã e este guard têm de impor
 * aal2; sem a opção, o token aal1 abre as páginas comuns.
 *
 * Regra: só a conta que activou expressamente a verificação no login precisa
 * de aal2 para navegar. Factores existentes continuam úteis para step-up;
 * operações críticas mantêm os seus guardas aal2 independentes.
 */
import { isLoginMfaEnabled } from "@/features/auth/login-mfa-policy";

export const SESSION_MFA_REQUIRED =
  "Unauthorized: activou a confirmação no login. Entre de novo e confirme o código.";

/** `aal` do payload de um token JÁ validado pelo Supabase (aqui só se descodifica). */
export function accessTokenAal(token: string): string | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const normalized = payload.replaceAll("-", "+").replaceAll("_", "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const aal = (JSON.parse(atob(padded)) as { aal?: unknown }).aal;
    return typeof aal === "string" ? aal : null;
  } catch {
    return null;
  }
}

export type VerifiedFactorLookup = (userId: string) => Promise<boolean>;

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { hasFactor: boolean; at: number }>();

/** Só para testes. */
export function clearSessionMfaCache() {
  cache.clear();
}

const lookupWithAdminApi: VerifiedFactorLookup = async (userId) => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (userError || !userData.user) throw userError ?? new Error("Conta indisponível.");
  if (!isLoginMfaEnabled(userData.user.app_metadata)) return false;
  const { data, error } = await supabaseAdmin.auth.admin.mfa.listFactors({ userId });
  if (error) throw error;
  return (data?.factors ?? []).some((factor) => factor.status === "verified");
};

/**
 * Lança `SESSION_MFA_REQUIRED` só com confirmação no login activada e token aal1.
 * Falha fechada: sem conseguir saber se a conta tem 2FA, um token aal1 não passa.
 * O resultado fica 60 s em memória por utilizador (só para tokens aal1).
 */
export async function assertSessionMfa(
  userId: string,
  aal: string | null,
  lookup: VerifiedFactorLookup = lookupWithAdminApi,
  now = Date.now(),
): Promise<void> {
  if (aal === "aal2") return;

  const cached = cache.get(userId);
  let hasFactor: boolean;
  if (cached && now - cached.at < CACHE_TTL_MS) {
    hasFactor = cached.hasFactor;
  } else {
    try {
      hasFactor = await lookup(userId);
    } catch {
      throw Object.assign(
        new Error("Unauthorized: não foi possível confirmar o 2FA desta conta. Tente novamente."),
        { statusCode: 401, sessionMfa: true },
      );
    }
    cache.set(userId, { hasFactor, at: now });
  }

  if (hasFactor) {
    throw Object.assign(new Error(SESSION_MFA_REQUIRED), { statusCode: 401, sessionMfa: true });
  }
}

/** Erro desta verificação (o middleware deixa-o passar tal como está). */
export function isSessionMfaError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "sessionMfa" in error);
}
