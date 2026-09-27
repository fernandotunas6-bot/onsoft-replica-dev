import { createServerFn } from "@tanstack/react-start";
import { getRequestIP } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { mapAppRoleToSgaCodes, mapSgaRoleCode, sgaClient } from "@/integrations/supabase/sga";
import { resolveSgaMembershipAdmin } from "@/integrations/supabase/sga-admin";
import { ensureTeacherHrRecord } from "@/features/people/server";
import { getAppName, getAppUrl, getAuthResetPasswordUrl } from "@/lib/app-config";
import { fetchSchoolBranding } from "@/features/auth/reset-password-server";
import { renderSchoolInvitationEmail } from "@/features/auth/email-templates";
import {
  resolveResendFromAddress,
  resolveSystemSender,
  sendResendEmail,
} from "@/features/integrations/resend-client";
import { isRateLimitBypassed } from "@/lib/rate-limit";
import { signInWithIdentifierInputSchema } from "./bi-login";
import { recordAccessAudit } from "@/features/audit/record-audit";
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

const BI_LOOKUP_RATE_LIMIT = { windowMs: 60 * 1000, max: 10 };
/** Por conta: 10 tentativas por 15 minutos, venham de onde vierem. */
const BI_ACCOUNT_RATE_LIMIT = { windowMs: 15 * 60 * 1000, max: 10 };

type AuthedContext = {
  supabase: SupabaseClient;
  userId: string;
  claims?: Record<string, unknown>;
};

function isAdministratorRole(role: string): boolean {
  const normalized = role.trim().toLowerCase();
  return ["administrador", "admin", "owner", "diretor geral", "director geral"].includes(
    normalized,
  );
}

async function requireAdminContext(context: AuthedContext) {
  const membership = await resolveSgaMembershipAdmin(context.userId);
  if (!membership) throw new Error("Não foi possível determinar a escola actual.");
  if (membership.appRole !== "Administrador" && membership.appRole !== "Secretaria") {
    throw new Error("Apenas Administrador e Secretaria podem aceder à gestão de acessos.");
  }
  return {
    schoolId: membership.schoolId,
    adminUserId: context.userId,
    appRole: membership.appRole,
    isAdministrator: membership.appRole === "Administrador",
  };
}

/**
 * A identidade (auth.users) é partilhada entre escolas; as memberships não.
 * Acções sobre a conta inteira — senha, bloqueio global — só são seguras
 * quando a pessoa não pertence a mais nenhuma escola. Caso contrário, um
 * administrador da escola A mexia no acesso da pessoa à escola B.
 */
export async function otherSchoolAccess(
  admin: Awaited<ReturnType<typeof loadAdminClient>>,
  userId: string,
  schoolId: string,
) {
  const { data: memberships } = await admin
    .from("school_memberships")
    .select("id, school_id, status")
    .eq("user_id", userId);
  const rows = (memberships ?? []) as Array<{ id: string; school_id: string; status: string }>;
  const otherActive = rows.filter((m) => m.school_id !== schoolId && m.status === "active");

  let adminAnywhere = false;
  if (rows.length) {
    // `member_roles` tem duas chaves para `roles`: sem indicar qual, o
    // PostgREST recusa o embed (PGRST201) e, com o erro ignorado, a conta
    // passava por não-administrador — a protecção ficava desligada. Usa-se a
    // composta `(school_id, role_id)`, que garante que o cargo é da mesma escola
    // que o vínculo.
    const { data: roleRows, error: roleError } = await admin
      .from("member_roles")
      .select("roles!member_roles_school_id_role_id_fkey(code)")
      .in(
        "membership_id",
        rows.map((m) => m.id),
      );
    // Sem conseguir ler os papéis, recusa-se (como se fosse administrador).
    if (roleError) return { hasOtherActiveSchools: otherActive.length > 0, adminAnywhere: true };
    adminAnywhere = ((roleRows ?? []) as Array<{ roles?: { code?: string } | null }>).some((r) =>
      isAdministratorRole(String(r.roles?.code ?? "")),
    );
  }
  return { hasOtherActiveSchools: otherActive.length > 0, adminAnywhere };
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
    const { schoolId, isAdministrator } = await requireAdminContext(context);
    if (data.cargo === "Administrador" && !isAdministrator) {
      throw new Error(
        "Apenas um Administrador pode convidar ou criar contas com cargo de Administrador.",
      );
    }
    const admin = await loadAdminClient();

    // Não usar inviteUserByEmail: o mailer nativo da Supabase (sem SMTP próprio)
    // envia um e-mail genérico "Supabase Auth" — proibido pela identidade
    // institucional do SIGA. A conta é criada directamente (determinístico) e o
    // link de acesso é entregue por um e-mail com a marca da escola via Resend,
    // no mesmo padrão de src/features/saas/admin-account.ts.
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: data.email,
      email_confirm: true,
      user_metadata: { full_name: data.fullName },
    });
    if (createError) {
      throw new Error(createError.message || "Não foi possível criar a conta de acesso.");
    }
    const userId = created.user?.id;
    if (!userId) throw new Error("Conta criada sem identificador de utilizador.");

    // Perfil, membership e papel são todos obrigatórios para a conta ser
    // funcional — se qualquer um falhar, a conta auth.users(userId) fica
    // órfã (criada, sem escola, sem perfil) se não for revertida. Igual ao
    // princípio aplicado em verify-oauth-account-server.ts: nunca deixar uma
    // conta "fantasma" para trás, mesmo numa falha admin-iniciada.
    let membership: { id: string } | null = null;
    try {
      const { error: profileError } = await admin.from("profiles").upsert(
        {
          id: userId,
          full_name: data.fullName,
          cargo: data.cargo,
        },
        { onConflict: "id" },
      );
      if (profileError) throw publicDatabaseError(profileError, "Não foi possível criar o perfil.");

      const { data: membershipRow, error: membershipError } = await admin
        .from("school_memberships")
        .insert({
          school_id: schoolId,
          user_id: userId,
          status: "active",
        })
        .select("id")
        .single();
      if (membershipError) {
        throw publicDatabaseError(membershipError, "Não foi possível criar a membership.");
      }
      membership = membershipRow;

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
      const { error: memberRoleError } = await admin.from("member_roles").insert({
        school_id: schoolId,
        membership_id: membership.id,
        role_id: role.id,
      });
      if (memberRoleError) {
        throw publicDatabaseError(memberRoleError, "Não foi possível atribuir o papel.");
      }
    } catch (provisioningError) {
      try {
        await admin.auth.admin.deleteUser(userId);
      } catch (cleanupError) {
        console.error(
          `[inviteSystemUser] Failed to clean up orphaned account ${userId}:`,
          cleanupError,
        );
      }
      throw provisioningError instanceof Error
        ? provisioningError
        : new Error("Não foi possível provisionar a conta.");
    }

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

    // Entrega do link de acesso por e-mail institucional (best-effort: a conta
    // já está criada e funcional mesmo que a entrega falhe).
    let inviteDelivered = false;
    let inviteDeliveryError: string | null = null;
    try {
      const { data: school } = await admin
        .from("schools")
        .select("id, name")
        .eq("id", schoolId)
        .maybeSingle();
      const branding = await fetchSchoolBranding(admin, schoolId);

      const { data: link, error: linkError } = await admin.auth.admin.generateLink({
        type: "recovery",
        email: data.email,
        options: { redirectTo: getAuthResetPasswordUrl() },
      });
      const accessUrl = link?.properties?.action_link;
      if (linkError || !accessUrl) {
        inviteDeliveryError = linkError?.message ?? "Não foi possível gerar o link de acesso.";
      } else {
        const apiKey = process.env["RESEND_API_KEY"]?.trim();
        if (!apiKey) {
          inviteDeliveryError = "RESEND_API_KEY não configurada — link de acesso não foi enviado.";
        } else {
          const message = renderSchoolInvitationEmail({
            schoolName: school?.name || getAppName(),
            roleName: data.cargo,
            invitationUrl: accessUrl,
            logoUrl: branding.logoUrl,
            primaryColor: branding.primaryColor,
            platformName: getAppName(),
            platformUrl: getAppUrl(),
            recipientEmail: data.email,
          });
          await sendResendEmail({
            apiKey,
            from: resolveSystemSender("auth", { schoolName: school?.name }),
            to: [data.email],
            subject: message.subject,
            html: message.html,
            text: message.text,
          });
          inviteDelivered = true;
        }
      }
    } catch (deliveryErr) {
      inviteDeliveryError =
        deliveryErr instanceof Error ? deliveryErr.message : "Falha ao enviar o convite.";
    }

    await recordAccessAudit({
      schoolId,
      actorUserId: context.userId,
      action: "access.user_invited",
      entityType: "auth_user",
      entityId: userId,
      metadata: { email: data.email, cargo: data.cargo },
    });

    return {
      id: userId,
      email: data.email,
      cargo: data.cargo,
      inviteDelivered,
      inviteDeliveryError,
    };
  });

export const updateSystemAccountCargo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => updateAccountCargoInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Unauthorized");
    const { schoolId, isAdministrator } = await requireAdminContext(context);
    if (data.userId === context.userId && data.cargo !== "Administrador") {
      throw new Error("Não pode remover o seu próprio cargo de Administrador.");
    }
    if (data.userId === context.userId && !isAdministrator) {
      throw new Error("Não tem permissão para alterar o seu próprio cargo.");
    }
    if (data.cargo === "Administrador" && !isAdministrator) {
      throw new Error("Apenas um Administrador pode atribuir o cargo de Administrador.");
    }

    const admin = await loadAdminClient();
    const { data: targetProfile } = await admin
      .from("profiles")
      .select("cargo")
      .eq("id", data.userId)
      .maybeSingle();

    if (targetProfile?.cargo && isAdministratorRole(targetProfile.cargo) && !isAdministrator) {
      throw new Error("Apenas Administradores podem alterar contas de outros Administradores.");
    }

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

    // O cargo do perfil é global (vale em todas as escolas da pessoa); o papel
    // desta escola vive em member_roles. Quem é administrador noutra escola só
    // é alterado por um Administrador, e o cargo global só muda se a pessoa não
    // tiver outras escolas activas.
    const access = await otherSchoolAccess(admin, data.userId, schoolId);
    if (access.adminAnywhere && !isAdministrator) {
      throw new Error("Apenas Administradores podem alterar contas de outros Administradores.");
    }

    await admin.from("member_roles").delete().eq("membership_id", membership.id);
    await admin.from("member_roles").insert({
      school_id: schoolId,
      membership_id: membership.id,
      role_id: role.id,
    });

    if (!access.hasOtherActiveSchools) {
      const { error: profileError } = await admin
        .from("profiles")
        .update({ cargo: data.cargo })
        .eq("id", data.userId);
      if (profileError) {
        throw publicDatabaseError(profileError, "Papel SGA actualizado, mas falhou o perfil.");
      }
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

    await recordAccessAudit({
      schoolId,
      actorUserId: context.userId,
      action: "access.cargo_changed",
      entityType: "auth_user",
      entityId: data.userId,
      metadata: { cargo: data.cargo },
    });
    return { id: data.userId, cargo: data.cargo };
  });

export const setSystemAccountDisabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => setAccountDisabledInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Unauthorized");
    const { schoolId, isAdministrator } = await requireAdminContext(context);
    if (data.userId === context.userId) {
      throw new Error("Não pode suspender a sua própria conta.");
    }
    if (!isAdministrator) {
      throw new Error("Apenas Administradores podem suspender ou reactivar contas de acesso.");
    }

    const admin = await loadAdminClient();
    const { data: targetProfile } = await admin
      .from("profiles")
      .select("cargo")
      .eq("id", data.userId)
      .maybeSingle();

    if (targetProfile?.cargo && isAdministratorRole(targetProfile.cargo)) {
      throw new Error("Não é permitido suspender a conta de outro Administrador.");
    }

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
      .update({ status: data.disabled ? "suspended" : "active" })
      .eq("id", membership.id);
    if (error) throw publicDatabaseError(error, "Não foi possível actualizar o estado da conta.");

    // O bloqueio de auth.users vale para todas as escolas. Com acesso activo a
    // outra escola, suspende-se só a membership desta — as outras escolas
    // decidem por si. Ao reactivar, o bloqueio global é levantado.
    const access = await otherSchoolAccess(admin, data.userId, schoolId);
    if (!data.disabled || !access.hasOtherActiveSchools) {
      await admin.auth.admin.updateUserById(data.userId, {
        ban_duration: data.disabled ? "876000h" : "none",
      });
    }

    await recordAccessAudit({
      schoolId,
      actorUserId: context.userId,
      action: data.disabled ? "access.account_disabled" : "access.account_enabled",
      entityType: "auth_user",
      entityId: data.userId,
      metadata: {},
    });
    return { id: data.userId, disabled: data.disabled };
  });

export const resendSystemInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => resendSystemInviteInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Unauthorized");
    const { schoolId, isAdministrator } = await requireAdminContext(context);
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

    // O link devolvido aqui abre a conta a quem o tiver: copiá-lo equivale a
    // entrar na conta da pessoa. Por isso, fora destes casos, só "Enviar
    // E-mail" (o link vai para a caixa da própria pessoa).
    const access = await otherSchoolAccess(admin, data.userId, schoolId);
    if (access.adminAnywhere) {
      throw new Error("Para contas de administrador, use Enviar E-mail.");
    }
    if (access.hasOtherActiveSchools) {
      throw new Error("Esta conta também dá acesso a outra escola. Use Enviar E-mail.");
    }
    if (!isAdministrator) {
      const { data: targetRoles, error: targetRolesError } = await admin
        .from("member_roles")
        .select("roles!member_roles_school_id_role_id_fkey(code)")
        .eq("membership_id", membership.id);
      if (targetRolesError) {
        throw new Error("Não foi possível confirmar o perfil desta conta. Use Enviar E-mail.");
      }
      const staffCodes = [
        ...mapAppRoleToSgaCodes("Secretaria"),
        ...mapAppRoleToSgaCodes("Tesouraria"),
      ];
      const isStaff = ((targetRoles ?? []) as Array<{ roles?: { code?: string } | null }>).some(
        (r) => staffCodes.includes(String(r.roles?.code ?? "").toLowerCase()),
      );
      if (isStaff) {
        throw new Error(
          "Só um Administrador pode copiar o link de acesso de pessoal administrativo. Use Enviar E-mail.",
        );
      }
    }

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
    await recordAccessAudit({
      schoolId,
      actorUserId: context.userId,
      action: "access.link_copied",
      entityType: "auth_user",
      entityId: data.userId,
      metadata: { kind },
    });
    return { email, kind, actionLink };
  });

/**
 * Envia o link de acesso por e-mail institucional (Resend + branding da escola),
 * como alternativa explícita a copiar/WhatsApp/mailto. Não substitui esses canais
 * — é mais uma opção, pedida pelo utilizador para quem prefere não copiar/colar.
 */
export const sendSystemInviteEmail = createServerFn({ method: "POST" })
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
    if (!email) throw new Error("Esta conta não tem email para enviar o acesso.");

    const kind = authData.user?.email_confirmed_at ? "recovery" : "invite";
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: kind,
      email,
      options: { redirectTo: getAuthResetPasswordUrl() },
    });
    if (linkError) {
      throw new Error(linkError.message || "Não foi possível gerar o link de acesso.");
    }
    const actionLink = linkData.properties?.action_link;
    if (!actionLink) throw new Error("O servidor não devolveu um link de acesso.");

    const apiKey = process.env["RESEND_API_KEY"]?.trim();
    if (!apiKey) {
      throw new Error("RESEND_API_KEY não configurada no servidor — não é possível enviar e-mail.");
    }

    const [{ data: school }, { data: profile }] = await Promise.all([
      admin.from("schools").select("name").eq("id", schoolId).maybeSingle(),
      admin.from("profiles").select("cargo").eq("id", data.userId).maybeSingle(),
    ]);
    const branding = await fetchSchoolBranding(admin, schoolId);

    const message = renderSchoolInvitationEmail({
      schoolName: school?.name || getAppName(),
      roleName: profile?.cargo || "Membro da Equipa",
      invitationUrl: actionLink,
      logoUrl: branding.logoUrl,
      primaryColor: branding.primaryColor,
      platformName: getAppName(),
      platformUrl: getAppUrl(),
      recipientEmail: email,
    });
    await sendResendEmail({
      apiKey,
      from: resolveSystemSender("auth", { schoolName: school?.name }),
      to: [email],
      subject: message.subject,
      html: message.html,
      text: message.text,
    });

    return { email, kind };
  });

/**
 * Login por B.I. (ou telefone) e senha, feito no servidor.
 *
 * Antes, o browser pedia o e-mail associado a um B.I. e depois entrava com ele:
 * qualquer pessoa descobria o e-mail de quem tivesse o B.I. Agora o e-mail
 * nunca sai do servidor. Só a sessão volta, e só com a senha certa; um B.I.
 * desconhecido e uma senha errada dão a mesma resposta.
 */
export const signInWithIdentifierFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => signInWithIdentifierInputSchema.parse(input))
  .handler(async ({ data }) => {
    const ip =
      (typeof getRequestIP === "function" ? getRequestIP({ xForwardedFor: true }) : null) ??
      "unknown";
    const rateLimitKey = `bi_lookup:${ip}`;
    // Limite partilhado por todas as instâncias: por IP e, à parte, por conta
    // (identificador) — quem use muitos IPs não tenta senhas sem fim numa conta.
    const identifierKey = `bi_login_identifier:${data.identifier.trim().toLowerCase()}`;
    if (!isRateLimitBypassed(rateLimitKey)) {
      const { consumeRateLimit } = await import("@/lib/shared-rate-limit");
      const ipOk = await consumeRateLimit([rateLimitKey], BI_LOOKUP_RATE_LIMIT);
      const accountOk = ipOk && (await consumeRateLimit([identifierKey], BI_ACCOUNT_RATE_LIMIT));
      if (!ipOk || !accountOk) {
        return { ok: false as const, error: "rate_limited" as const };
      }
    }

    const { resolveBiOrEmailToUserEmail, passwordGrant } = await import("./bi-login");
    const email = await resolveBiOrEmailToUserEmail(data.identifier);
    if (!email.includes("@")) return { ok: false as const, error: "invalid_credentials" as const };

    return passwordGrant(email, data.password);
  });

export const resetStaffPasswordDirect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => resetStaffPasswordInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Unauthorized");
    const { schoolId, isAdministrator } = await requireAdminContext(context);
    if (!isAdministrator) {
      throw new Error(
        "Apenas Administradores podem redefinir senhas de funcionários directamente.",
      );
    }
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

    if (data.userId !== context.userId) {
      const { data: targetProfile } = await admin
        .from("profiles")
        .select("cargo")
        .eq("id", data.userId)
        .maybeSingle();
      const access = await otherSchoolAccess(admin, data.userId, schoolId);

      if (
        (targetProfile?.cargo && isAdministratorRole(targetProfile.cargo)) ||
        access.adminAnywhere
      ) {
        throw new Error(
          "Não é permitido redefinir directamente a senha de outro Administrador. Utilize a recuperação por e-mail.",
        );
      }
      // A senha vale para todas as escolas da pessoa: só esta escola não decide.
      if (access.hasOtherActiveSchools) {
        throw new Error(
          "Esta conta também dá acesso a outra escola. Use a recuperação de senha por e-mail.",
        );
      }
    }

    const { error } = await admin.auth.admin.updateUserById(data.userId, {
      password: data.newPassword,
    });
    if (error) {
      throw new Error(error.message || "Não foi possível redefinir a senha do funcionário.");
    }

    await recordAccessAudit({
      schoolId,
      actorUserId: context.userId,
      action: "access.password_reset_direct",
      entityType: "auth_user",
      entityId: data.userId,
      metadata: {},
    });
    return { success: true, userId: data.userId };
  });

/** Papéis reais da escola (para preencher o cargo do convite institucional). */
export const listSchoolRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!context) throw new Error("Unauthorized");
    const { schoolId } = await requireAdminContext(context);
    const admin = await loadAdminClient();

    const { data, error } = await admin
      .from("roles")
      .select("code, name")
      .eq("school_id", schoolId)
      .order("name", { ascending: true });
    if (error) return [] as Array<{ code: string; name: string }>;
    return (data ?? []) as Array<{ code: string; name: string }>;
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
    const { schoolId, isAdministrator } = await requireAdminContext(context);
    // Igual a inviteSystemUser: só um Administrador convida administradores.
    // Sem isto, a Secretaria criava um convite owner/admin (por exemplo para
    // um segundo e-mail seu), aceitava-o e tornava-se administradora.
    if (isAdministratorRole(data.roleCode) && !isAdministrator) {
      throw new Error("Apenas um Administrador pode convidar com cargo de Administrador.");
    }
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

    // Entrega automática por e-mail institucional, além do link copiável que a UI
    // já oferece — best-effort: o convite fica válido de qualquer forma.
    let emailDelivered = false;
    let emailDeliveryError: string | null = null;
    try {
      const [{ data: school }, { data: role }] = await Promise.all([
        admin.from("schools").select("name").eq("id", schoolId).maybeSingle(),
        admin
          .from("roles")
          .select("name")
          .eq("school_id", schoolId)
          .eq("code", data.roleCode)
          .maybeSingle(),
      ]);
      const branding = await fetchSchoolBranding(admin, schoolId);
      const apiKey = process.env["RESEND_API_KEY"]?.trim();
      if (!apiKey) {
        emailDeliveryError = "RESEND_API_KEY não configurada — link de convite não foi enviado.";
      } else {
        const invitationUrl = `${getAppUrl()}/convite/${rawToken}`;
        const message = renderSchoolInvitationEmail({
          schoolName: school?.name || getAppName(),
          roleName: role?.name || data.roleCode,
          invitationUrl,
          logoUrl: branding.logoUrl,
          primaryColor: branding.primaryColor,
          platformName: getAppName(),
          platformUrl: getAppUrl(),
          recipientEmail: data.email,
        });
        await sendResendEmail({
          apiKey,
          from: resolveSystemSender("auth", { schoolName: school?.name }),
          to: [data.email],
          subject: message.subject,
          html: message.html,
          text: message.text,
        });
        emailDelivered = true;
      }
    } catch (deliveryErr) {
      emailDeliveryError =
        deliveryErr instanceof Error
          ? deliveryErr.message
          : "Falha ao enviar o convite por e-mail.";
    }

    await recordAccessAudit({
      schoolId,
      actorUserId: context.userId,
      action: "access.invitation_created",
      entityType: "school_invitation",
      entityId: String(invitation.id),
      metadata: { email: invitation.email, role_code: invitation.role_code },
    });

    return {
      invitation,
      rawToken,
      emailDelivered,
      emailDeliveryError,
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

    await recordAccessAudit({
      schoolId,
      actorUserId: context.userId,
      action: "access.invitation_revoked",
      entityType: "school_invitation",
      entityId: data.invitationId,
      metadata: {},
    });
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

    // 3.1. Validar correspondência do destinatário (anti-sequestro de convite)
    // O e-mail vem da conta no Auth, não das claims: sem e-mail nas claims
    // (conta só com telefone, token sem o campo) a verificação era saltada e
    // qualquer pessoa com o link aceitava o convite — incluindo de administrador.
    const { data: authData } = await admin.auth.admin.getUserById(userId);
    const authUser = authData?.user;
    const userEmail = authUser?.email?.toLowerCase().trim() ?? "";
    const invitedEmail = String(invitation.email ?? "")
      .toLowerCase()
      .trim();
    if (!invitedEmail || userEmail !== invitedEmail) {
      throw new Error(
        userEmail
          ? `Este convite foi emitido para ${invitedEmail}. A sessão actual (${userEmail}) não corresponde ao destinatário do convite.`
          : `Este convite foi emitido para ${invitedEmail}. Entre com a conta desse e-mail para o aceitar.`,
      );
    }
    if (!authUser?.email_confirmed_at) {
      throw new Error("Confirme primeiro o e-mail da sua conta e depois abra o convite outra vez.");
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
      .eq("school_id", schoolId)
      .eq("code", roleCode)
      .maybeSingle();

    if (role?.id) {
      // Idempotente: só insere se ainda não tiver este role neste membership
      await admin
        .from("member_roles")
        .upsert(
          { school_id: schoolId, membership_id: membershipId, role_id: role.id },
          { onConflict: "membership_id,role_id", ignoreDuplicates: true },
        );
    }

    // 6. Ligar people.user_id por email (idempotente)
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

    await recordAccessAudit({
      schoolId,
      actorUserId: context.userId,
      action: "access.invitation_accepted",
      entityType: "school_invitation",
      entityId: String(invitation.id),
      metadata: { role_code: roleCode },
    });
    return { success: true, schoolId, roleCode };
  });
