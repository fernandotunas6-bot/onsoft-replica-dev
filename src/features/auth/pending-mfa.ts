import { supabase } from "@/integrations/supabase/client";
import { listVerificationFactors, type VerificationFactors } from "@/features/auth/verification";
import { isLoginMfaEnabled } from "@/features/auth/login-mfa-policy";

/**
 * Factores a confirmar quando a conta tem 2FA e a sessão ainda é aal1;
 * `null` quando não há nada a pedir. Sem factor verificado, aal1 basta.
 */
export async function pendingMfaFactors(): Promise<VerificationFactors | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!isLoginMfaEnabled(sessionData.session?.user.app_metadata)) return null;
  const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assurance.data?.nextLevel !== "aal2" || assurance.data.currentLevel === "aal2") return null;
  const factors = await listVerificationFactors();
  return factors.passkeyId || factors.totpId ? factors : null;
}
