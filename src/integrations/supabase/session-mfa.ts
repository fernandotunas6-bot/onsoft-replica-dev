/**
 * 2FA na sessão, não só nas tabelas do dinheiro.
 *
 * O Supabase emite um token aal1 logo depois da senha certa, antes do desafio
 * 2FA; o ecrã pede o código, mas o token já existe. Sem esta verificação, quem
 * tivesse só a senha de uma conta com 2FA activo chamava directamente todas as
 * server functions que não exigem `aal2` (acessos, senhas, integrações, alunos).
 *
 * Regra: conta com factor verificado só entra com aal2. Conta sem factor
 * continua a entrar com aal1 — activar 2FA é escolha dela (o dinheiro exige-o à
 * parte, com `requireAal2`).
 */

export const SESSION_MFA_REQUIRED =
  "Unauthorized: esta conta tem 2FA activo. Entre de novo e confirme o código.";

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
  const { data, error } = await supabaseAdmin.auth.admin.mfa.listFactors({ userId });
  if (error) throw error;
  return (data?.factors ?? []).some((factor) => factor.status === "verified");
};

/**
 * Lança `SESSION_MFA_REQUIRED` quando a conta tem 2FA e o token é aal1.
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
