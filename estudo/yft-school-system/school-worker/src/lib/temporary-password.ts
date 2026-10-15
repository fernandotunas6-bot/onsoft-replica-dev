import type { Env } from '../app-env';

/** Regista que [uid] acabou de receber uma senha temporária. */
export async function markTemporaryPassword(env: Env, uid: string, now = Date.now()) {
  await env.DB.prepare('UPDATE Users SET temp_password_issued_at = ? WHERE uid = ?').bind(now, uid).run();
}

/**
 * A senha temporária só conta como trocada se o Firebase disser que a senha
 * mudou depois de ter sido emitida. Não basta a app afirmá-lo.
 */
export function changedAfterIssue(passwordUpdatedAt: number | null, issuedAt: number | null): boolean {
  if (issuedAt == null) return true;
  return passwordUpdatedAt != null && passwordUpdatedAt > issuedAt;
}
