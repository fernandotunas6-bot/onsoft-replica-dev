import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";

export interface VerifyOAuthAccountResponse {
  authorized: boolean;
  reason: "authorized" | "no_school_membership";
}

/**
 * Google authenticates an identity; only the SIGA database grants access.
 * Do not delete auth.users on a failed membership check: the identity may
 * belong to an existing password account, a suspended member, or another app.
 * This guard never provisions schools, roles or memberships.
 */
export const verifyOAuthAccountFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<VerifyOAuthAccountResponse> => {
    if (!context?.userId) throw new Error("Unauthorized");

    const db = await loadSgaAdminClient();
    const [{ data: memberships, error: membershipError }, { data: platformAdmins, error: adminError }] =
      await Promise.all([
        db.from("school_memberships")
          .select("id")
          .eq("user_id", context.userId)
          .eq("status", "active")
          .limit(1),
        db.from("platform_admins")
          .select("user_id")
          .eq("user_id", context.userId)
          .limit(1),
      ]);

    // Fail closed if an authorization source is unavailable.
    if (membershipError || adminError) {
      console.error("[VerifyOAuthAccount] Authorization lookup failed", {
        membershipError: membershipError?.code,
        adminError: adminError?.code,
      });
      throw new Error("Não foi possível verificar as permissões desta conta.");
    }

    if ((memberships?.length ?? 0) > 0 || (platformAdmins?.length ?? 0) > 0) {
      return { authorized: true, reason: "authorized" };
    }

    // Keep the Auth identity intact. Only the local SIGA session is rejected.
    return { authorized: false, reason: "no_school_membership" };
  });
