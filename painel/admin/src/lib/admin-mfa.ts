/**
 * 2.º passo do login do ADMIN. As rotas /api/saas/* do SIGA recusam sessões sem `aal2`,
 * por isso, depois da palavra-passe, decide-se:
 * - a sessão já tem MFA → entra;
 * - há um autenticador confirmado → pede o código;
 * - não há → limpa registos por confirmar e regista um novo (QR + chave manual).
 *
 * Sem imports com alias: os testes da raiz importam este ficheiro directamente.
 */

type Factor = { id: string; status: string };

export type AdminMfaApi = {
  getAuthenticatorAssuranceLevel(): Promise<{ data: { currentLevel: string | null } | null }>;
  listFactors(): Promise<{ data: { totp?: Factor[]; all?: Factor[] } | null }>;
  unenroll(params: { factorId: string }): Promise<unknown>;
  enroll(params: { factorType: "totp"; friendlyName: string }): Promise<{
    data: { id: string; totp: { qr_code: string; secret: string } } | null;
    error: Error | null;
  }>;
};

export type AdminMfaStep =
  | { step: "done" }
  | { step: "verify"; factorId: string }
  | { step: "enroll"; factorId: string; qrCode: string; secret: string };

export const ADMIN_MFA_FRIENDLY_NAME = "SIGA Plus — administração";

export async function prepareAdminMfa(mfa: AdminMfaApi): Promise<AdminMfaStep> {
  const { data: aal } = await mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === "aal2") return { step: "done" };

  const { data: factors } = await mfa.listFactors();
  const verified = factors?.totp?.find((factor) => factor.status === "verified");
  if (verified) return { step: "verify", factorId: verified.id };

  // Factores por confirmar de uma tentativa anterior impediriam um novo registo
  // com o mesmo nome.
  for (const factor of factors?.all ?? []) {
    if (factor.status !== "verified") await mfa.unenroll({ factorId: factor.id });
  }
  const { data: enrolled, error } = await mfa.enroll({
    factorType: "totp",
    friendlyName: ADMIN_MFA_FRIENDLY_NAME,
  });
  if (error || !enrolled) throw error ?? new Error("Não foi possível iniciar o MFA.");
  return {
    step: "enroll",
    factorId: enrolled.id,
    qrCode: enrolled.totp.qr_code,
    secret: enrolled.totp.secret,
  };
}
