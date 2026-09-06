import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { resolveSgaMembershipAdmin } from "@/integrations/supabase/sga-admin";
import { sgaClient } from "@/integrations/supabase/sga";
import { setAccountDisabledInputSchema } from "./schemas";

export * from "./server";

export const setSystemAccountDisabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => setAccountDisabledInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Unauthorized");

    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Não foi possível determinar a escola actual.");
    if (membership.appRole !== "Administrador" && membership.appRole !== "Secretaria") {
      throw new Error("Apenas Administrador e Secretaria podem gerir contas de acesso.");
    }
    if (data.userId === context.userId) {
      throw new Error("Não pode suspender a sua própria conta.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = sgaClient(supabaseAdmin);
    const { data: targetMembership, error: membershipError } = await admin
      .from("school_memberships")
      .select("id, status")
      .eq("user_id", data.userId)
      .eq("school_id", membership.schoolId)
      .maybeSingle();
    if (membershipError) {
      throw publicDatabaseError(membershipError, "Não foi possível localizar a conta.");
    }
    if (!targetMembership) throw new Error("Conta não encontrada nesta escola.");

    const now = new Date().toISOString();
    const { error: stateError } = await admin
      .from("school_memberships")
      .update(
        data.disabled
          ? { status: "suspended", suspended_at: now }
          : { status: "active", suspended_at: null, activated_at: now },
      )
      .eq("id", targetMembership.id)
      .eq("school_id", membership.schoolId);
    if (stateError) {
      throw publicDatabaseError(stateError, "Não foi possível actualizar o estado da conta.");
    }

    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      ban_duration: data.disabled ? "876000h" : "none",
    });
    if (authError) {
      // Roll back the membership state if the Auth ban/unban fails so the two
      // authorization sources do not silently diverge.
      await admin
        .from("school_memberships")
        .update(
          data.disabled
            ? { status: targetMembership.status, suspended_at: null }
            : { status: "suspended", suspended_at: now },
        )
        .eq("id", targetMembership.id)
        .eq("school_id", membership.schoolId);
      throw new Error(authError.message || "Não foi possível actualizar o acesso no Auth.");
    }

    return {
      id: data.userId,
      disabled: data.disabled,
      membershipStatus: data.disabled ? "suspended" : "active",
    };
  });
