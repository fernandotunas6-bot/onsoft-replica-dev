import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { resolveSgaMembershipAdmin } from "@/integrations/supabase/sga-admin";
import { sgaClient } from "@/integrations/supabase/sga";
import {
  acceptSchoolInvitationInputSchema,
  createSchoolInvitationInputSchema,
} from "./schemas";

async function loadAdminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return { admin: sgaClient(supabaseAdmin), supabaseAdmin };
}

async function requireInvitationManager(userId: string) {
  const membership = await resolveSgaMembershipAdmin(userId);
  if (!membership) throw new Error("Não foi possível determinar a escola actual.");
  if (membership.appRole !== "Administrador" && membership.appRole !== "Secretaria") {
    throw new Error("Apenas Administrador e Secretaria podem gerir convites.");
  }
  return membership;
}

async function sha256(value: string) {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const createSchoolInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => createSchoolInvitationInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Unauthorized");
    const membership = await requireInvitationManager(context.userId);
    const { admin } = await loadAdminClient();
    const roleCode = data.roleCode.trim().toLowerCase();

    if (roleCode === "owner") {
      throw new Error("O papel owner não pode ser atribuído por convite escolar.");
    }
    if (roleCode === "admin" && membership.appRole !== "Administrador") {
      throw new Error("Apenas um Administrador pode convidar outro Administrador.");
    }

    const { data: role, error: roleError } = await admin
      .from("roles")
      .select("id, code")
      .eq("school_id", membership.schoolId)
      .eq("code", roleCode)
      .maybeSingle();
    if (roleError) throw publicDatabaseError(roleError, "Não foi possível validar o papel do convite.");
    if (!role?.id) throw new Error("O papel seleccionado não existe nesta escola.");

    const rawToken = Array.from(crypto.getRandomValues(new Uint8Array(24)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const tokenHash = await sha256(rawToken);
    const email = data.email.toLowerCase().trim();

    const { data: invitation, error } = await admin
      .from("school_invitations")
      .insert({
        school_id: membership.schoolId,
        email,
        role_code: roleCode,
        invited_by: context.userId,
        token_hash: tokenHash,
        status: "pending",
      })
      .select("id, email, role_code, expires_at")
      .single();
    if (error) throw publicDatabaseError(error, "Não foi possível criar o convite institucional.");

    return { invitation, rawToken };
  });

export const acceptSchoolInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => acceptSchoolInvitationInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Unauthorized");
    const { supabase, userId } = context;
    const { admin, supabaseAdmin } = await loadAdminClient();
    const tokenHash = await sha256(data.token);

    const { data: invitation, error: invErr } = await admin
      .from("school_invitations")
      .select("id, school_id, email, role_code, expires_at, status")
      .eq("token_hash", tokenHash)
      .eq("status", "pending")
      .maybeSingle();
    if (invErr || !invitation) throw new Error("Convite inválido ou já utilizado.");

    if (invitation.expires_at && new Date(invitation.expires_at) < new Date()) {
      await admin
        .from("school_invitations")
        .update({ status: "expired", updated_at: new Date().toISOString() })
        .eq("id", invitation.id);
      throw new Error("O convite expirou. Solicite um novo convite ao administrador da escola.");
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (authError) throw new Error(authError.message || "Não foi possível validar a conta autenticada.");
    const accountEmail = String(authData.user?.email ?? "").toLowerCase().trim();
    const invitedEmail = String(invitation.email ?? "").toLowerCase().trim();
    if (!accountEmail || accountEmail !== invitedEmail) {
      throw new Error("Este convite foi emitido para outro endereço de email.");
    }

    const schoolId = String(invitation.school_id);
    const roleCode = String(invitation.role_code || "teacher").toLowerCase();
    if (roleCode === "owner") {
      throw new Error("Convite com papel owner inválido.");
    }

    const { data: role, error: roleError } = await admin
      .from("roles")
      .select("id")
      .eq("school_id", schoolId)
      .eq("code", roleCode)
      .maybeSingle();
    if (roleError) throw publicDatabaseError(roleError, "Não foi possível validar o papel do convite.");
    if (!role?.id) throw new Error("O papel do convite não existe nesta escola.");

    const { data: existingMembership, error: existingError } = await admin
      .from("school_memberships")
      .select("id, status")
      .eq("school_id", schoolId)
      .eq("user_id", userId)
      .maybeSingle();
    if (existingError) {
      throw publicDatabaseError(existingError, "Não foi possível validar a associação à escola.");
    }

    let membershipId: string;
    if (existingMembership?.id) {
      membershipId = String(existingMembership.id);
      const { error } = await admin
        .from("school_memberships")
        .update({ status: "active", activated_at: new Date().toISOString(), suspended_at: null })
        .eq("id", membershipId)
        .eq("school_id", schoolId);
      if (error) throw publicDatabaseError(error, "Não foi possível reactivar a associação à escola.");
    } else {
      const { data: newMembership, error } = await admin
        .from("school_memberships")
        .insert({
          school_id: schoolId,
          user_id: userId,
          status: "active",
          invited_at: new Date().toISOString(),
          activated_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (error || !newMembership?.id) {
        throw publicDatabaseError(error, "Não foi possível associar a sua conta à escola.");
      }
      membershipId = String(newMembership.id);
    }

    const { error: roleInsertError } = await admin
      .from("member_roles")
      .upsert(
        { school_id: schoolId, membership_id: membershipId, role_id: role.id },
        { onConflict: "membership_id,role_id", ignoreDuplicates: true },
      );
    if (roleInsertError) {
      throw publicDatabaseError(roleInsertError, "Não foi possível atribuir o papel do convite.");
    }

    await admin
      .from("people")
      .update({ user_id: userId })
      .eq("school_id", schoolId)
      .ilike("email", invitedEmail)
      .is("user_id", null);

    const { error: updateErr } = await admin
      .from("school_invitations")
      .update({
        status: "accepted",
        accepted_at: new Date().toISOString(),
        accepted_by: userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", invitation.id)
      .eq("school_id", schoolId)
      .eq("status", "pending");
    if (updateErr) {
      throw publicDatabaseError(updateErr, "Não foi possível confirmar a aceitação do convite.");
    }

    void supabase.auth.refreshSession().catch(() => undefined);
    return { success: true, schoolId, roleCode };
  });
