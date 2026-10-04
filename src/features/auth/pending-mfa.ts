import { supabase } from "@/integrations/supabase/client";

/**
 * Factor TOTP a confirmar quando a conta tem 2FA e a sessão ainda é aal1;
 * `null` quando não há nada a pedir. Sem factor verificado, aal1 basta.
 */
export async function pendingMfaFactorId(): Promise<string | null> {
  const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assurance.data?.nextLevel !== "aal2" || assurance.data.currentLevel === "aal2") return null;
  const factors = await supabase.auth.mfa.listFactors();
  return factors.data?.totp[0]?.id ?? null;
}
