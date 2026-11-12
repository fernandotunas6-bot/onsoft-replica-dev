/**
 * O segundo factor no início de sessão é uma escolha explícita da conta.
 * A ausência do campo significa desligado, inclusive para contas antigas.
 * Isto não altera os guardas aal2 das operações administrativas/financeiras.
 */
export const LOGIN_MFA_PREFERENCE_KEY = "siga_login_mfa_enabled";

export function isLoginMfaEnabled(metadata: unknown): boolean {
  return Boolean(
    metadata &&
    typeof metadata === "object" &&
    (metadata as Record<string, unknown>)[LOGIN_MFA_PREFERENCE_KEY] === true,
  );
}
