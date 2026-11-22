/**
 * Confirmação no login (2FA) — a mesma regra do SIGA
 * (`src/integrations/supabase/session-mfa.ts` na raiz do repositório).
 *
 * Só a conta que activou a confirmação no login (`app_metadata.siga_login_mfa_enabled`)
 * e tem um factor verificado precisa de um token aal2. Antes deste ficheiro, o Worker
 * aceitava o token aal1 dessas contas e mostrava notas, faltas e pagamentos que o SIGA
 * lhes recusava (análise 22 do SIGA, P1-3). Falha fechada: sem confirmar, recusa.
 *
 * A app ainda não faz o segundo passo; estas contas recebem 403 com a explicação, em vez
 * de um 401 que a app trataria como sessão terminada.
 */
import { SgaError, sgaConfig, type SgaEnv } from './rest';

export const LOGIN_MFA_PREFERENCE_KEY = 'siga_login_mfa_enabled';
export const SESSION_MFA_REQUIRED_MESSAGE =
  'Esta conta pede a confirmação em dois passos no login, que a app ainda não faz. Use o SIGA Plus no browser.';

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { hasFactor: boolean; at: number }>();

/** Só para testes. */
export function clearSgaSessionMfaCache() {
  cache.clear();
}

function tokenClaims(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replaceAll('-', '+').replaceAll('_', '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const parsed = JSON.parse(atob(padded)) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** `client_id` dos tokens que o Supabase emite a aplicações OAuth; `null` numa sessão normal. */
export function oauthClientIdOf(token: string): string | null {
  const clientId = tokenClaims(token)?.client_id;
  return typeof clientId === 'string' && clientId.trim() ? clientId.trim() : null;
}

/** `aal` de um token JÁ validado em /auth/v1/user (aqui só se descodifica). */
export function tokenAal(token: string): string | null {
  const aal = tokenClaims(token)?.aal;
  return typeof aal === 'string' ? aal : null;
}

type AdminUser = { app_metadata?: Record<string, unknown> | null; factors?: Array<{ status?: string }> | null };

async function loginMfaRequired(env: SgaEnv, userId: string): Promise<boolean> {
  const cfg = sgaConfig(env);
  const res = await fetch(`${cfg.url}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    headers: { apikey: cfg.secretKey, Authorization: `Bearer ${cfg.secretKey}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error('admin user lookup failed');
  const user = (await res.json()) as AdminUser | null;
  if (!user || typeof user !== 'object' || Array.isArray(user)) throw new Error('unexpected admin user payload');
  if (user.app_metadata?.[LOGIN_MFA_PREFERENCE_KEY] !== true) return false;
  return (user.factors ?? []).some((factor) => factor?.status === 'verified');
}

export async function assertSgaSessionMfa(env: SgaEnv, userId: string, token: string, now = Date.now()) {
  if (tokenAal(token) === 'aal2') return;
  const cached = cache.get(userId);
  let required: boolean;
  if (cached && now - cached.at < CACHE_TTL_MS) {
    required = cached.hasFactor;
  } else {
    try {
      required = await loginMfaRequired(env, userId);
    } catch {
      throw new SgaError(401, 'SESSION_MFA_UNVERIFIED');
    }
    cache.set(userId, { hasFactor: required, at: now });
  }
  if (required) throw new SgaError(403, 'SESSION_MFA_REQUIRED', SESSION_MFA_REQUIRED_MESSAGE);
}
