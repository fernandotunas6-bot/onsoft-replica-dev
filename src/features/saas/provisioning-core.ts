import { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import type { CreateSchoolWizardInput } from "@/features/saas/schemas";
import { syncTenantUsageForSchool } from "@/features/saas/usage-sync";
import { bootstrapSchoolDefaults } from "@/features/saas/school-bootstrap";
import { getPlatformSubdomain } from "@/lib/saas/platform-domain";

/**
 * Cria uma escola nova de ponta a ponta: tenant comercial, escola, o
 * administrador dela (conta + perfil + school_membership) e o registo de
 * uso/auditoria. Segue o mesmo padrão de escrita privilegiada usado em
 * src/features/enrollment/server.ts — passos sequenciais explícitos, não uma
 * função SQL opaca, para que um erro a meio seja fácil de localizar.
 *
 * Partilhada por dois pontos de entrada em src/features/saas/server.ts: o
 * wizard interno (`provisionSchoolTenant`, gateado por `requirePlatformAdmin`)
 * e o signup público da landing (`signupSchoolPublic`, sem sessão).
 * `auditUserId` fica `null` no caso público — não há utilizador autenticado
 * a registar.
 *
 * Vive num ficheiro à parte de server.ts de propósito: o plugin de Babel do
 * TanStack Start que separa client/server dos `createServerFn` faz parsing
 * do ficheiro inteiro à procura de `.handler(...)`, e uma função "normal"
 * (não-`createServerFn`) a meio desse ficheiro confundia esse parser
 * ("Unexpected token" na chaveta de fecho). Isolar aqui evita o problema —
 * este ficheiro não tem nenhum `createServerFn`, logo o plugin nem o toca.
 */
export async function provisionTenantCore(
  data: CreateSchoolWizardInput,
  opts: { auditUserId: string | null; source: "platform_admin" | "public_signup" },
): Promise<{
  success: true;
  tenantId: string;
  slug: string;
  hostname: string;
  bootstrapSeeded: string[];
}> {
  const db = await loadSgaAdminClient();

  const { data: plan } = await db
    .from("plans")
    .select("id, max_students, max_storage_gb")
    .eq("code", data.plan_code)
    .maybeSingle();

  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + data.trial_days);

  const { data: tenant, error: tenantErr } = await db
    .from("tenants")
    .insert({
      name: data.name,
      slug: data.slug,
      status: "active",
      plan_id: plan?.id ?? null,
      subscription_status: data.trial_days > 0 ? "trialing" : "active",
      trial_ends_at: trialEndsAt.toISOString(),
      contact_name: data.contact_name,
      contact_phone: data.contact_phone || null,
      contact_email: data.contact_email,
      max_students: plan?.max_students ?? 500,
      max_storage_gb: plan?.max_storage_gb ?? 10,
    })
    .select("id")
    .single();
  if (tenantErr) throw publicDatabaseError(tenantErr, "Não foi possível criar o tenant.");
  const tenantId = tenant.id as string;

  if (plan?.id) {
    const subscriptionStatus = data.trial_days > 0 ? "trialing" : "active";
    const { error: subErr } = await db.from("subscriptions").insert({
      tenant_id: tenantId,
      plan_id: plan.id,
      status: subscriptionStatus,
      current_period_start: new Date().toISOString(),
      current_period_end: trialEndsAt.toISOString(),
    });
    if (subErr) {
      await db.from("tenants").delete().eq("id", tenantId);
      throw publicDatabaseError(subErr, "Não foi possível criar a subscrição.");
    }
  }

  const cleanupTenant = async () => {
    await db.from("tenants").delete().eq("id", tenantId);
  };

  const hostname = getPlatformSubdomain(data.slug);
  const { error: domainErr } = await db.from("tenant_domains").insert({
    tenant_id: tenantId,
    hostname,
    type: "siga_subdomain",
    status: "active",
    ssl_status: "active",
  });
  if (domainErr) {
    await cleanupTenant();
    throw publicDatabaseError(domainErr, "Subdomínio já em uso por outra escola.");
  }

  const generatedPublicCode = `SIGA-AO-${Math.floor(100000 + Math.random() * 900000)}`;

  const { data: school, error: schoolErr } = await db
    .from("schools")
    .insert({
      tenant_id: tenantId,
      public_code: generatedPublicCode,
      name: data.name,
      commercial_name: data.commercial_name || data.name,
      nif: data.nif || null,
      address: data.address || null,
      city: data.city || "Luanda",
      phone: data.phone || data.contact_phone || null,
      email: data.email || data.contact_email,
      logo_url: data.logo_url || null,
    })
    .select("id")
    .single();
  if (schoolErr) {
    await cleanupTenant();
    throw publicDatabaseError(schoolErr, "Não foi possível criar o registo da escola.");
  }
  const schoolId = school.id as string;

  let adminUserId: string | null = null;
  try {
    // inviteUserByEmail em vez de createUser: cria a conta E envia o
    // e-mail de convite da Supabase com o link para definir password —
    // sem isto, o administrador criado não tinha nenhuma forma de entrar.
    const { data: created, error: createUserErr } = await db.auth.admin.inviteUserByEmail(
      data.admin_email,
      { data: { full_name: data.admin_name } },
    );
    if (createUserErr || !created.user) {
      throw new Error(createUserErr?.message || "Não foi possível criar a conta do administrador.");
    }
    adminUserId = created.user.id;

    const { error: profileErr } = await db.from("profiles").upsert(
      {
        id: adminUserId,
        school_id: schoolId,
        cargo: "Administrador",
        full_name: data.admin_name,
        display_name: data.admin_name,
      },
      { onConflict: "id" },
    );
    if (profileErr)
      throw publicDatabaseError(profileErr, "Não foi possível criar o perfil do administrador.");

    const { data: membership, error: membershipErr } = await db
      .from("school_memberships")
      .insert({ school_id: schoolId, user_id: adminUserId, status: "active" })
      .select("id")
      .single();
    if (membershipErr) {
      throw publicDatabaseError(
        membershipErr,
        "Não foi possível associar o administrador à escola.",
      );
    }

    // Procurar role 'owner' global (is_system=true) ou específico da escola
    const { data: existingRole } = await db
      .from("roles")
      .select("id")
      .or(`school_id.eq.${schoolId},and(school_id.is.null,is_system.eq.true)`)
      .in("code", ["owner", "admin", "administrador"])
      .limit(1)
      .maybeSingle();
    let roleId = existingRole?.id as string | undefined;
    if (!roleId) {
      const { data: createdRole, error: roleErr } = await db
        .from("roles")
        .insert({
          school_id: schoolId,
          code: "owner",
          name: "Proprietário",
          is_system: false,
        })
        .select("id")
        .single();
      if (roleErr)
        throw publicDatabaseError(roleErr, "Não foi possível preparar o papel de administrador.");
      roleId = createdRole.id as string;
    }

    const { error: memberRoleErr } = await db
      .from("member_roles")
      .insert({ membership_id: membership.id, role_id: roleId });
    if (memberRoleErr) {
      throw publicDatabaseError(
        memberRoleErr,
        "Não foi possível atribuir o papel de administrador.",
      );
    }
  } catch (err) {
    if (adminUserId) await db.auth.admin.deleteUser(adminUserId).catch(() => undefined);
    await db.from("schools").delete().eq("id", schoolId);
    await cleanupTenant();
    throw err instanceof Error ? err : new Error("Falha ao provisionar o administrador da escola.");
  }

  await syncTenantUsageForSchool(tenantId, schoolId);

  const { seeded: bootstrapSeeded } = await bootstrapSchoolDefaults(db, {
    schoolId,
    schoolName: data.name,
    slug: data.slug,
    adminUserId,
  });

  await db.from("saas_audit_logs").insert({
    tenant_id: tenantId,
    user_id: opts.auditUserId,
    action: "TENANT_PROVISIONED",
    entity: "tenant",
    entity_id: tenantId,
    metadata: {
      slug: data.slug,
      plan_code: data.plan_code,
      school_id: schoolId,
      source: opts.source,
      bootstrap_seeded: bootstrapSeeded,
    },
  });

  return {
    success: true,
    tenantId,
    slug: data.slug,
    hostname: getPlatformSubdomain(data.slug),
    bootstrapSeeded,
  };
}
