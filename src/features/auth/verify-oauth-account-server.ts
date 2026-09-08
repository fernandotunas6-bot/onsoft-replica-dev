import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadSgaAdminClient, resolveSgaMembershipAdmin } from "@/integrations/supabase/sga-admin";

export interface VerifyOAuthAccountResponse {
  authorized: boolean;
  /** "no_school_membership" cobre também vínculo existente mas inactivo — resolveSgaMembership já filtra por isActive. */
  reason: "authorized" | "no_school_membership";
}

/**
 * Portão de autorização pós-OAuth, como fazem as grandes plataformas
 * corporativas (Google Workspace, Microsoft Entra, Okta): o provedor social
 * só prova QUEM a pessoa é, nunca decide O QUE ela pode acessar. Login social
 * nunca é, por si só, um mecanismo de provisionamento de conta no SIGA — só
 * administradores criam contas e atribuem escola/papel (inviteSystemUser,
 * createSchoolInvitation, admin-account.ts).
 *
 * Este servidor confirma, com o service role (não confiando no cliente), se a
 * conta recém-autenticada tem pelo menos um vínculo activo (`school_memberships`)
 * com alguma escola. Se não tiver, a conta `auth.users` — criada
 * automaticamente pelo próprio Supabase durante o fluxo OAuth, sem
 * intervenção nossa — é apagada imediatamente. Não fica "conta fantasma": ou
 * a pessoa já foi convidada por um administrador, ou não sobra rasto nenhum
 * dela no sistema.
 */
export const verifyOAuthAccountFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<VerifyOAuthAccountResponse> => {
    if (!context) throw new Error("Unauthorized");

    const membership = await resolveSgaMembershipAdmin(context.userId);

    if (membership) {
      return { authorized: true, reason: "authorized" };
    }

    // Sem vínculo com nenhuma escola: esta conta não foi provisionada por um
    // administrador. Apagar imediatamente — não deixar existir uma conta
    // auth.users sem dono nem propósito no sistema.
    try {
      const db = await loadSgaAdminClient();
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.auth.admin.deleteUser(context.userId);
      try {
        await db.from("saas_audit_logs").insert({
          action: "oauth_account_rejected_and_deleted",
          entity_type: "auth",
          entity_id: context.userId,
          metadata: { timestamp: new Date().toISOString() },
        });
      } catch {
        /* Silencioso para não interromper */
      }
    } catch (err) {
      console.error("[VerifyOAuthAccount] Failed to delete unauthorized account:", err);
    }

    return { authorized: false, reason: "no_school_membership" };
  });
