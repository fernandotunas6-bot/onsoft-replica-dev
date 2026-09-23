import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveSgaMembershipAdmin } from "@/integrations/supabase/sga-admin";

export interface VerifyInstitutionalMembershipResponse {
  authorized: boolean;
  reason: "authorized" | "no_active_school_membership";
}

/**
 * Confirma no servidor que uma sessão Auth tem vínculo activo a uma escola.
 * Não elimina contas: serve para login por senha, magic link e sessões já
 * existentes. O fluxo OAuth continua a tratar a eliminação da conta criada
 * sem convite no seu verificador específico.
 */
export const verifyInstitutionalMembershipFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<VerifyInstitutionalMembershipResponse> => {
    if (!context) throw new Error("Unauthorized");

    const membership = await resolveSgaMembershipAdmin(context.userId);
    return membership
      ? { authorized: true, reason: "authorized" }
      : { authorized: false, reason: "no_active_school_membership" };
  });
