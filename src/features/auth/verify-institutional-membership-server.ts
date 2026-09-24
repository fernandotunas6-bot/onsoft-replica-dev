import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveSgaMembership } from "@/integrations/supabase/sga";

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

    // A verificação de acesso inicial não depende da escola guardada em cookie:
    // o utilizador pode ter mudado de instituição desde a última sessão.
    //
    // Corre com o cliente da sessão, não com o privilegiado: uma função que
    // pergunta "tens acesso?" não deve responder com uma identidade que tem
    // acesso a tudo. As quatro tabelas que `resolveSgaMembership` lê
    // (`school_memberships`, `schools`, `member_roles`, `roles`) têm política de
    // leitura que cobre o próprio utilizador — `user_id = auth.uid()` na
    // primeira, `is_school_member`/`is_active_member` nas outras — logo quem tem
    // vínculo lê-o, e quem não tem lê vazio, que é a resposta certa.
    const membership = await resolveSgaMembership(context.supabase, context.userId);
    return membership
      ? { authorized: true, reason: "authorized" }
      : { authorized: false, reason: "no_active_school_membership" };
  });
