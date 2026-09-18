import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { mapAppRoleToSgaCodes, mapSgaRoleCode, sgaClient } from "@/integrations/supabase/sga";
import { resolveSgaMembershipAdmin } from "@/integrations/supabase/sga-admin";
import { ensureTeacherHrRecord } from "@/features/people/server";
import { resolveBiToEmailInputSchema } from "./bi-login";
import {
  inviteUserInputSchema,
  resendSystemInviteInputSchema,
  resetStaffPasswordInputSchema,
  setAccountDisabledInputSchema,
  updateAccountCargoInputSchema,
  createSchoolInvitationInputSchema,
  revokeSchoolInvitationInputSchema,
  acceptSchoolInvitationInputSchema,
} from "./schemas";

type AuthedContext = {
  supabase: SupabaseClient;
  userId: string;
};

async function requireAdminContext(context: AuthedContext) {
  const membership = await resolveSgaMembershipAdmin(context.userId);
  if (!membership) throw new Error("Não foi possível determinar a escola actual.");
  if (membership.appRole !== "Administrador" && membership.appRole !== "Secretaria") {
    throw new Error("Apenas Administrador e Secretaria podem gerir contas de acesso.");
  }
  return { schoolId: membership.schoolId, adminUserId: context.userId };
}

async function loadAdminClient() {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return sgaClient(supabaseAdmin);
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? error.message
        : "Configure SUPABASE_SECRET_KEY no servidor para gerir contas Auth.",
    );
  }
}

export const listSystemAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!context) throw new Error("Unauthorized");
    const { schoolId } = await requireAdminContext(context);
    const admin = await loadAdminClient();

    const { data: memberships, error } = await admin
      .from("school_memberships")
      .select("id, user_id, status, created_at, updated_at")
      .eq("school_id", schoolId)
      .order("created_at");
    if (error) throw publicDatabaseError(error, "Não foi possível listar as contas.");

    const membershipIds = (memberships ?? []).map((row: { id: string }) => row.id);
    const { data: memberRoles } = membershipIds.length
      ? await admin
          .from("member_roles")
          .select("membership_id, role_id")
          .in("membership_id", membershipIds)
      : { data: [] as Array<{ membership_id: string; role_id: string }> };
    const roleIds = [
      ...new Set((memberRoles ?? []).map((row: { role_id: string }) => row.role_id)),
    ];
    const { data: roles } = roleIds.length
      ? await admin.from("roles").select("id, code, name").in("id", roleIds)
      : { data: [] as Array<{ id: string; code: string; name: string }> };
    const roleById = new Map((roles ?? []).map((row) => [row.id, row]));
    const roleByMembership = new Map<string, { code: string; name: string }>();
    for (const row of memberRoles ?? []) {
      const role = roleById.get(row.role_id);
      if (!role) continue;
      const current = roleByMembership.get(row.membership_id);
      if (!current || ["owner", "admin"].includes(role.code)) {
        roleByMembership.set(row.membership_id, role);
      }
    }

    const accounts = await Promise.all(
      (memberships ?? []).map(
        async (membership: {
          id: string;
          user_id: string;
          status: string;
          created_at: string;
          updated_at: string;
        }) => {
          const { data } = await admin.auth.admin.getUserById(membership.user_id);
          const user = data.user;
          const { data: profile } = await admin
            .from("profiles")
            .select("full_name")
            .eq("id", membership.user_id)
            .maybeSingle();
          const role = roleByMembership.get(membership.id);
          const cargo = mapSgaRoleCode(role?.code);
          return {
            id: membership.user_id,
            full_name: profile?.full_name || user?.email || "Sem nome",
            email: user?.email ?? null,
            cargo,
            created_at: membership.created_at,
            updated_at: membership.updated_at,
            last_sign_in_at: user?.last_sign_in_at ?? null,
            email_confirmed: Boolean(user?.email_confirmed_at),
            disabled: membership.status !== "active" || Boolean(user?.banned_until),
            is_self: membership.user_id === context.userId,
          };
        },
      ),
    );

    return accounts;
  });

export const inviteSystemUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => inviteUserInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Unauthorized");
    const { schoolId } = await requireAdminContext(context);
    const admin = await loadAdminClient();

    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
      data.email,
      {
        data: { full_name: data.fullName },
      },
    );
    if (inviteError) {
      throw new Error(inviteError.message || "Não foi possível enviar o convite.");
    }
    const userId = invited.user?.id;
    if (!userId) throw new Error("Convite criado sem identificador de utilizador.");

    const { error: profileError } = await admin.from("profiles").upsert(
      {
        id: userId,
        full_name: data.fullName,
        cargo: data.cargo,
      },
      { onConflict: "id" },
    );
    if (profileError) {
      throw publicDatabaseError(profileError, "Convite criado, mas falhou o perfil.");
    }

    const { data: membership, error: membershipError } = await admin
      .from("school_memberships")
      .insert({
        school_id: schoolId,
        user_id: userId,
        status: "active",
      })
      .select("id")
      .single();
    if (membershipError) {
      throw publicDatabaseError(membershipError, "Conta criada, mas falhou a membership.");
    }

    const codes = mapAppRoleToSgaCodes(data.cargo);
    const { data: role } = await admin
      .from("roles")
      .select("id, code")
      .eq("school_id", schoolId)
      .in("code", codes.length ? codes : ["secretary"])
      .limit(1)
      .maybeSingle();
    if (!role?.id) {
      throw new Error(`Papel SGA em falta para ${data.cargo}.`);
    }
    await admin.from("member_roles").insert({
      school_id: schoolId,
      membership_id: membership.id,
      role_id: role.id,
    });

    if (data.cargo === "Professor") {
      await ensureTeacherHrRecord({
        schoolId,
        userId,
        actorId: context.userId,
        fullName: data.fullName,
        email: data.email,
      });
    }

    // Vinculação idempotente com o registo de pessoa (se já existir na escola com este email)
    try {
      const { data: existingPerson } = await admin
        .from("people")
        .select("id")
        .eq("school_id", schoolId)
        .eq("email", data.email.trim().toLowerCase())
        .maybeSingle();

      if (existingPerson?.id) {
        await admin.from("people").update({ user_id: userId }).eq("id", existingPerson.id);
      }
    } catch {
      // Falha não impeditiva na vinculação biográfica
    }

    return { id: userId, email: data.email, cargo: data.cargo };
  });

export const updateSystemAccountCargo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => updateAccountCargoInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Unauthorized");
    const { schoolId } = await requireAdminContext(context);
    if (data.userId === context.userId && data.cargo !== "Administrador") {
      throw new Error("Não pode remover o seu próprio cargo de Administrador.");
    }

    const admin = await loadAdminClient();
    const { data: membership, error } = await admin
      .from("school_memberships")
      .select("id")
      .eq("school_id", schoolId)
      .eq("user_id", data.userId)
      .maybeSingle();
    if (error) throw publicDatabaseError(error, "Não foi possível actualizar o cargo.");
    if (!membership) throw new Error("Conta não encontrada nesta escola.");

    const codes = mapAppRoleToSgaCodes(data.cargo);
    const { data: role } = await admin
      .from("roles")
      .select("id")
      .eq("school_id", schoolId)
      .in("code", codes.length ? codes : ["secretary"])
      .limit(1)
      .maybeSingle();
    if (!role?.id) throw new Error(`Papel SGA em falta para ${data.cargo}.`);

    await admin.from("member_roles").delete().eq("membership_id", membership.id);
    await admin.from("member_roles").insert({
      school_id: schoolId,
      membership_id: membership.id,
      role_id: role.id,
    });

    const { error: profileError } = await admin
      .from("profiles")
      .update({ cargo: data.cargo })
      .eq("id", data.userId);
    if (profileError) {
      throw publicDatabaseError(profileError, "Papel SGA actualizado, mas falhou o perfil.");
    }

    if (data.cargo === "Professor") {
      const { data: authUser } = await admin.auth.admin.getUserById(data.userId);
      await ensureTeacherHrRecord({
        schoolId,
        userId: data.userId,
        actorId: context.userId,
        fullName: String(
          authUser.user?.user_metadata?.["full_name"] ?? authUser.user?.email ?? "Professor",
        ),
        email: String(authUser.user?.email ?? ""),
      });
    }

    return { id: data.userId, cargo: data.cargo };
  });

export const setSystemAccountDisabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => setAccountDisabledInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Unauthorized");
    const { schoolId } = await requireAdminContext(context);
    if (data.userId === context.userId) {
      throw new Error("Não pode suspender a sua própria conta.");
    }

    const admin = await loadAdminClient();
    const { data: membership, error: profileError } = await admin
      .from("school_memberships")
      .select("id")
      .eq("user_id", data.userId)
      .eq("school_id", schoolId)
      .maybeSingle();
    if (profileError)
      throw publicDatabaseError(profileError, "Não foi possível localizar a conta.");
    if (!membership) throw new Error("Conta não encontrada nesta escola.");

    const { error } = await admin
      .from("school_memberships")
      .update({ status: data.disabled ? "disabled" : "active" })
      .eq("id", membership.id);
    if (error) throw publicDatabaseError(error, "Não foi possível actualizar o estado da conta.");

    await admin.auth.admin.updateUserById(data.userId, {
      ban_duration: data.disabled ? "876000h" : "none",
    });

    return { id: data.userId, disabled: data.disabled };
  });

export const resendSystemInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => resendSystemInviteInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Unauthorized");
    const { schoolId } = await requireAdminContext(context);
    if (data.userId === context.userId) {
      throw new Error("Use Alterar senha para a sua própria conta.");
    }
    const admin = await loadAdminClient();
    const { data: membership, error: membershipError } = await admin
      .from("school_memberships")
      .select("id")
      .eq("user_id", data.userId)
      .eq("school_id", schoolId)
      .maybeSingle();
    if (membershipError) {
      throw publicDatabaseError(membershipError, "Não foi possível validar a conta.");
    }
    if (!membership) throw new Error("Conta não encontrada nesta escola.");

    const { data: authData, error: userError } = await admin.auth.admin.getUserById(data.userId);
    if (userError) throw new Error(userError.message || "Não foi possível ler o utilizador.");
    const email = authData.user?.email;
    if (!email) throw new Error("Esta conta não tem email para reenviar o acesso.");

    const kind = authData.user?.email_confirmed_at ? "recovery" : "invite";
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: kind,
      email,
    });
    if (linkError) {
      throw new Error(linkError.message || "Não foi possível gerar o link de acesso.");
    }
    const actionLink = linkData.properties?.action_link;
    if (!actionLink) throw new Error("O servidor não devolveu um link de acesso.");
    return { email, kind, actionLink };
  });

export const resolveBiToEmailFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => resolveBiToEmailInputSchema.parse(input))
  .handler(async ({ data }) => {
    const { resolveBiOrEmailToUserEmail } = await import("./bi-login");
    const resolvedEmail = await resolveBiOrEmailToUserEmail(data.identifier);
    return { email: resolvedEmail };
  });

export const resetStaffPasswordDirect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => resetStaffPasswordInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Unauthorized");
    const { schoolId } = await requireAdminContext(context);
    const admin = await loadAdminClient();

    const { data: membership, error: membershipError } = await admin
      .from("school_memberships")
      .select("id")
      .eq("user_id", data.userId)
      .eq("school_id", schoolId)
      .maybeSingle();
    if (membershipError || !membership) {
      throw new Error("Conta de funcionário não encontrada nesta escola.");
    }

    const { error } = await admin.auth.admin.updateUserById(data.userId, {
      password: data.newPassword,
    });
    if (error) {
      throw new Error(error.message || "Não foi possível redefinir a senha do funcionário.");
    }

    return { success: true, userId: data.userId };
  });

export const listSchoolInvitations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!context) throw new Error("Unauthorized");
    const { schoolId } = await requireAdminContext(context);
    const admin = await loadAdminClient();

    try {
      const { data: invitations, error } = await admin
        .from("school_invitations")
        .select("id, email, role_code, status, expires_at, created_at, accepted_at")
        .eq("school_id", schoolId)
        .order("created_at", { ascending: false });

      if (error) {
        return [];
      }
      return invitations ?? [];
    } catch {
      return [];
    }
  });

export const createSchoolInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => createSchoolInvitationInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Unauthorized");
    const { schoolId } = await requireAdminContext(context);
    const admin = await loadAdminClient();

    const rawToken = Array.from(crypto.getRandomValues(new Uint8Array(24)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Hash token for database storage
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(rawToken));
    const tokenHash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const { data: invitation, error } = await admin
      .from("school_invitations")
      .insert({
        school_id: schoolId,
        email: data.email.toLowerCase().trim(),
        role_code: data.roleCode,
        invited_by: context.userId,
        token_hash: tokenHash,
        status: "pending",
      })
      .select("id, email, role_code, expires_at")
      .single();

    if (error) {
      throw publicDatabaseError(error, "Não foi possível criar o convite institucional.");
    }

    return {
      invitation,
      rawToken,
    };
  });

export const revokeSchoolInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => revokeSchoolInvitationInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Unauthorized");
    const { schoolId } = await requireAdminContext(context);
    const admin = await loadAdminClient();

    const { error } = await admin
      .from("school_invitations")
      .update({ status: "revoked", updated_at: new Date().toISOString() })
      .eq("id", data.invitationId)
      .eq("school_id", schoolId);

    if (error) {
      throw publicDatabaseError(error, "Não foi possível revogar o convite.");
    }

    return { success: true };
  });

/**
 * Aceitar um convite institucional.
 * Fluxo:
 *  1. Calcular SHA-256 do token em bruto recebido no link
 *  2. Procurar invitation pendente com esse token_hash
 *  3. Verificar que não expirou
 *  4. Criar (ou recuperar) school_membership para o utilizador autenticado
 *  5. Atribuir o role_code do convite ao membership
 *  6. Ligar people.user_id se existir registo biográfico com o mesmo email
 *  7. Marcar invitation como "accepted"
 */
export const acceptSchoolInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => acceptSchoolInvitationInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Unauthorized");
    const { supabase, userId } = context;
    const admin = await loadAdminClient();

    // 1. Hash do token
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(data.token));
    const tokenHash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // 2. Lookup invitation por token_hash (índice parcial em status='pending')
    const { data: invitation, error: invErr } = await admin
      .from("school_invitations")
      .select("id, school_id, email, role_code, expires_at, status")
      .eq("token_hash", tokenHash)
      .eq("status", "pending")
      .maybeSingle();

    if (invErr || !invitation) {
      throw new Error("Convite inválido ou já utilizado.");
    }

    // 3. Verificar expiração
    if (invitation.expires_at && new Date(invitation.expires_at) < new Date()) {
      await admin.from("school_invitations").update({ status: "expired" }).eq("id", invitation.id);
      throw new Error("O convite expirou. Solicite um novo convite ao administrador da escola.");
    }

    const schoolId = invitation.school_id as string;

    // 4. Criar ou recuperar membership
    const { data: existingMembership } = await admin
      .from("school_memberships")
      .select("id")
      .eq("school_id", schoolId)
      .eq("user_id", userId)
      .maybeSingle();

    let membershipId: string;
    if (existingMembership?.id) {
      membershipId = existingMembership.id as string;
      // Reactivar se estava suspensa
      await admin
        .from("school_memberships")
        .update({ status: "active", updated_at: new Date().toISOString() })
        .eq("id", membershipId);
    } else {
      const { data: newMembership, error: memErr } = await admin
        .from("school_memberships")
        .insert({
          school_id: schoolId,
          user_id: userId,
          status: "active",
          invited_at: invitation.expires_at
            ? new Date(invitation.expires_at).toISOString()
            : new Date().toISOString(),
          activated_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (memErr || !newMembership) {
        throw publicDatabaseError(memErr, "Não foi possível associar a sua conta à escola.");
      }
      membershipId = newMembership.id as string;
    }

    // 5. Atribuir role do convite
    const roleCode = (invitation.role_code as string) || "teacher";
    const { data: role } = await admin
      .from("roles")
      .select("id")
      .eq("code", roleCode)
      .maybeSingle();

    if (role?.id) {
      // Idempotente: só insere se ainda não tiver este role neste membership
      await admin
        .from("member_roles")
        .upsert(
          { membership_id: membershipId, role_id: role.id },
          { onConflict: "membership_id,role_id", ignoreDuplicates: true },
        );
    }

    // 6. Ligar people.user_id por email (idempotente)
    const invitedEmail = (invitation.email as string).toLowerCase().trim();
    try {
      await admin
        .from("people")
        .update({ user_id: userId })
        .eq("school_id", schoolId)
        .ilike("email", invitedEmail)
        .is("user_id", null);
    } catch {
      // Não crítico — falha silenciosa se people não tiver coluna email ou user_id
    }

    // 7. Marcar como aceite
    const { error: updateErr } = await admin
      .from("school_invitations")
      .update({
        status: "accepted",
        accepted_at: new Date().toISOString(),
        accepted_by: userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", invitation.id);

    if (updateErr) {
      throw publicDatabaseError(updateErr, "Não foi possível confirmar a aceitação do convite.");
    }

    // Invalidar sessão client (forçar refresh de memberships)
    void supabase.auth.refreshSession().catch(() => undefined);

    return { success: true, schoolId, roleCode };
  });
