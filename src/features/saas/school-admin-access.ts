/**
 * Diagnóstico e reparação do acesso do administrador de uma escola já criada.
 *
 * O provisionamento novo verifica-se a si próprio (`findProvisioningGaps`), mas
 * as escolas que já existem ficaram como ficaram: registos antigos sem convite
 * entregue (sem `RESEND_API_KEY` nunca saiu e-mail nenhum), contas sem perfil,
 * trials que terminaram antes de o director conseguir entrar. Isto responde «o
 * administrador desta escola consegue entrar e configurá-la?» e corrige o que
 * se corrige sem decidir nada por ninguém.
 *
 * O que NUNCA faz: dar privilégios de administrador global (`platform_admins`),
 * mudar senhas, reactivar vínculos desactivados, desbloquear contas ou mexer na
 * assinatura. Isso é decisão de quem opera (ADMIN → Gerir).
 *
 * Usado pelo ADMIN (`/api/saas/tenants/admin-access`, só administradores de
 * plataforma) e pela página de boas-vindas do SIGA (só o próprio administrador,
 * e só para a própria conta).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthResetPasswordUrl } from "@/lib/app-config";
import { seedDefaultRolePermissions } from "@/features/saas/school-bootstrap";
import { sendAdminAccessEmail } from "@/features/saas/admin-account";
import {
  SCHOOL_ADMIN_ROLE_CODES,
  assessSchoolAdminAccess,
  type SchoolAdminAccessIssue,
  type SchoolAdminAccessSnapshot,
  type SchoolAdminAccountSnapshot,
} from "@/features/saas/school-admin-access-rules";
import type { SubscriptionLifecycle, TenantStatus } from "@/features/saas/types";

type AuthUserLike = {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
  last_sign_in_at?: string | null;
  banned_until?: string | null;
  factors?: Array<{ status?: string | null }> | null;
};

/** Lê o necessário para `assessSchoolAdminAccess`. `null` se o tenant não existe. */
export async function loadSchoolAdminAccessSnapshot(
  db: SupabaseClient,
  ref: { tenantId: string } | { schoolId: string },
): Promise<SchoolAdminAccessSnapshot | null> {
  let tenantId: string;
  let school: SchoolAdminAccessSnapshot["school"] = null;

  if ("schoolId" in ref) {
    const { data, error } = await db
      .from("schools")
      .select("id, name, status, tenant_id")
      .eq("id", ref.schoolId)
      .maybeSingle();
    if (error) throw new Error("Não foi possível ler a escola.");
    if (!data?.tenant_id) return null;
    tenantId = String(data.tenant_id);
    school = { id: String(data.id), name: String(data.name ?? ""), status: data.status ?? null };
  } else {
    tenantId = ref.tenantId;
    const { data, error } = await db
      .from("schools")
      .select("id, name, status")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error("Não foi possível ler a escola.");
    school = data
      ? { id: String(data.id), name: String(data.name ?? ""), status: data.status ?? null }
      : null;
  }

  const { data: tenant, error: tenantErr } = await db
    .from("tenants")
    .select("id, name, slug, status, subscription_status, trial_ends_at")
    .eq("id", tenantId)
    .maybeSingle();
  if (tenantErr) throw new Error("Não foi possível ler o tenant.");
  if (!tenant) return null;

  const snapshot: SchoolAdminAccessSnapshot = {
    tenant: {
      id: String(tenant.id),
      name: String(tenant.name ?? ""),
      slug: String(tenant.slug ?? ""),
      status: tenant.status as TenantStatus,
      subscription_status: (tenant.subscription_status as SubscriptionLifecycle | null) ?? null,
      trial_ends_at: (tenant.trial_ends_at as string | null) ?? null,
    },
    school,
    admins: [],
  };
  if (!school) return snapshot;

  const [{ data: roles, error: rolesErr }, { data: memberships, error: membershipsErr }] =
    await Promise.all([
      db
        .from("roles")
        .select("id, code")
        .eq("school_id", school.id)
        .in("code", [...SCHOOL_ADMIN_ROLE_CODES]),
      db
        .from("school_memberships")
        .select("id, user_id")
        .eq("school_id", school.id)
        .eq("status", "active"),
    ]);
  if (rolesErr || membershipsErr) throw new Error("Não foi possível ler os papéis da escola.");
  const adminRoles = new Map((roles ?? []).map((r) => [String(r.id), String(r.code)]));
  if (adminRoles.size === 0 || !memberships?.length) return snapshot;

  const { data: memberRoles, error: memberRolesErr } = await db
    .from("member_roles")
    .select("membership_id, role_id")
    .eq("school_id", school.id)
    .in("role_id", [...adminRoles.keys()]);
  if (memberRolesErr) throw new Error("Não foi possível ler os papéis atribuídos.");

  const { data: rolePerms, error: rolePermsErr } = await db
    .from("role_permissions")
    .select("role_id")
    .eq("school_id", school.id)
    .in("role_id", [...adminRoles.keys()]);
  if (rolePermsErr) throw new Error("Não foi possível ler as permissões dos papéis.");
  const permsByRole = new Map<string, number>();
  for (const row of rolePerms ?? []) {
    const id = String(row.role_id);
    permsByRole.set(id, (permsByRole.get(id) ?? 0) + 1);
  }

  const userByMembership = new Map(memberships.map((m) => [String(m.id), String(m.user_id)]));
  const rolesByUser = new Map<string, string[]>();
  for (const row of memberRoles ?? []) {
    const userId = userByMembership.get(String(row.membership_id));
    if (!userId) continue;
    const list = rolesByUser.get(userId) ?? [];
    list.push(String(row.role_id));
    rolesByUser.set(userId, list);
  }
  if (rolesByUser.size === 0) return snapshot;

  const userIds = [...rolesByUser.keys()];
  const { data: profiles } = await db.from("profiles").select("id, school_id").in("id", userIds);
  const profileById = new Map((profiles ?? []).map((p) => [String(p.id), p]));

  for (const userId of userIds) {
    const roleIds = rolesByUser.get(userId) ?? [];
    const { data: authData } = await db.auth.admin.getUserById(userId);
    const user = (authData?.user ?? null) as AuthUserLike | null;
    const profile = profileById.get(userId);
    const admin: SchoolAdminAccountSnapshot = {
      userId,
      email: user?.email ?? null,
      roleCodes: roleIds.map((id) => adminRoles.get(id) ?? "?"),
      rolePermissions: Math.max(0, ...roleIds.map((id) => permsByRole.get(id) ?? 0)),
      accountExists: Boolean(user),
      emailConfirmed: Boolean(user?.email_confirmed_at),
      lastSignInAt: user?.last_sign_in_at ?? null,
      bannedUntil: user?.banned_until ?? null,
      hasProfile: Boolean(profile),
      profileSchoolId: (profile?.school_id as string | null | undefined) ?? null,
      verifiedFactors: (user?.factors ?? []).filter((f) => f.status === "verified").length,
    };
    snapshot.admins.push(admin);
  }
  return snapshot;
}

export type SchoolAdminAccessLink = {
  email: string;
  /** Link de definição de senha. Só para quem opera a plataforma, nunca para o público. */
  url: string;
  emailed: boolean;
  emailError: string | null;
};

export type SchoolAdminAccessRepair = {
  actions: string[];
  accessLinks: SchoolAdminAccessLink[];
  before: SchoolAdminAccessIssue[];
  after: SchoolAdminAccessIssue[];
};

/**
 * Aplica as correcções `auto` e, se pedido, gera links de acesso para os
 * administradores que nunca entraram. Idempotente: correr duas vezes não muda
 * nada à segunda.
 *
 * `onlyUserId` limita a reparação a uma conta (a página de boas-vindas só
 * repara a conta de quem lá está).
 */
export async function repairSchoolAdminAccess(
  db: SupabaseClient,
  ref: { tenantId: string } | { schoolId: string },
  options: { issueAccessLinks?: boolean; onlyUserId?: string } = {},
): Promise<SchoolAdminAccessRepair> {
  const snapshot = await loadSchoolAdminAccessSnapshot(db, ref);
  if (!snapshot) throw new Error("Escola não encontrada.");
  const before = assessSchoolAdminAccess(snapshot);
  const actions: string[] = [];
  const accessLinks: SchoolAdminAccessLink[] = [];
  const school = snapshot.school;
  if (!school) return { actions, accessLinks, before, after: before };

  const relevant = before.filter(
    (issue) => !options.onlyUserId || !issue.userId || issue.userId === options.onlyUserId,
  );
  const has = (code: SchoolAdminAccessIssue["code"], userId: string) =>
    relevant.some((issue) => issue.code === code && issue.userId === userId);

  if (relevant.some((issue) => issue.code === "role_without_permissions")) {
    await seedDefaultRolePermissions(db, school.id);
    actions.push("Permissões dos papéis da escola repostas.");
  }

  for (const admin of snapshot.admins) {
    if (options.onlyUserId && admin.userId !== options.onlyUserId) continue;
    if (!admin.accountExists) continue;

    if (has("email_unconfirmed", admin.userId)) {
      const { error } = await db.auth.admin.updateUserById(admin.userId, { email_confirm: true });
      if (!error) actions.push(`E-mail de ${admin.email ?? admin.userId} confirmado.`);
    }

    if (has("profile_missing", admin.userId)) {
      const { error } = await db.from("profiles").upsert(
        {
          id: admin.userId,
          school_id: school.id,
          cargo: "Administrador",
          // NOT NULL na base; o nome completo é pedido à pessoa ao entrar.
          display_name: admin.email?.split("@")[0] || "Administrador",
        },
        { onConflict: "id" },
      );
      if (!error) actions.push(`Perfil de ${admin.email ?? admin.userId} criado.`);
    } else if (has("profile_without_school", admin.userId)) {
      // Só preenche o que está vazio: um perfil com outra escola fica como está.
      const { error } = await db
        .from("profiles")
        .update({ school_id: school.id })
        .eq("id", admin.userId)
        .is("school_id", null);
      if (!error) actions.push(`Perfil de ${admin.email ?? admin.userId} ligado à escola.`);
    }

    if (options.issueAccessLinks && admin.email && has("never_signed_in", admin.userId)) {
      const { data: link, error } = await db.auth.admin.generateLink({
        type: "recovery",
        email: admin.email,
        options: { redirectTo: getAuthResetPasswordUrl() },
      });
      const url = link?.properties?.action_link ?? null;
      if (error || !url) {
        actions.push(`Não foi possível gerar o link de acesso de ${admin.email}.`);
        continue;
      }
      const delivery = await sendAdminAccessEmail({
        email: admin.email,
        schoolName: school.name,
        url,
      });
      accessLinks.push({
        email: admin.email,
        url,
        emailed: delivery.sent,
        emailError: delivery.sent ? null : delivery.error,
      });
      actions.push(
        delivery.sent
          ? `Link de acesso enviado para ${admin.email}.`
          : `Link de acesso gerado para ${admin.email} (e-mail não enviado: entregue o link).`,
      );
    }
  }

  const afterSnapshot = await loadSchoolAdminAccessSnapshot(db, ref);
  const after = afterSnapshot ? assessSchoolAdminAccess(afterSnapshot) : before;
  return { actions, accessLinks, before, after };
}
