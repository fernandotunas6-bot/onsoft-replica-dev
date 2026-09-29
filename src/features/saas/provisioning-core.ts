import { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import type { CreateSchoolWizardInput } from "@/features/saas/schemas";
import { syncTenantUsageForSchool } from "@/features/saas/usage-sync";
import { bootstrapSchoolDefaults } from "@/features/saas/school-bootstrap";
import {
  describeProvisioningGaps,
  findProvisioningGaps,
} from "@/features/saas/provisioning-verify";
import { getPlatformSubdomain } from "@/lib/saas/platform-domain";
import { createSchoolAdminAccount, type SchoolAdminAccount } from "@/features/saas/admin-account";
import { reportSigaError, reportSigaEvent } from "@/lib/ops-report";

type ProvisioningResult = {
  success: true;
  tenantId: string;
  slug: string;
  hostname: string;
  bootstrapSeeded: string[];
  adminInviteDelivered: boolean;
  adminPasswordSet: boolean;
  adminSetupUrl: string | null;
};

/**
 * Onde o provisionamento ia quando parou.
 *
 * Existe por uma razão concreta: quando isto falha, o cliente vê «Falha ao
 * criar a escola» e reverte-se tudo — não fica registo nenhum na base, porque
 * o `saas_audit_logs` só é escrito no fim. Sem isto, uma escola que não
 * consegue nascer é invisível para quem opera a plataforma, e o único sinal é
 * o cliente desistir.
 */
type ProvisioningTrace = {
  stage: string;
  tenantId: string | null;
  schoolId: string | null;
};

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
): Promise<ProvisioningResult> {
  const startedAt = Date.now();
  const trace: ProvisioningTrace = { stage: "plan", tenantId: null, schoolId: null };
  try {
    const result = await runProvisioning(data, opts, trace);
    reportSigaEvent("tenant.provisioning.completed", {
      tenant_id: result.tenantId,
      school_id: trace.schoolId,
      source: opts.source,
      count: result.bootstrapSeeded.length,
      duration_ms: Date.now() - startedAt,
    });
    if (!result.adminPasswordSet && !result.adminInviteDelivered) {
      // A escola existe e ninguém lhe consegue entrar: sem senha definida no
      // registo e sem convite entregue, o administrador não tem caminho para
      // dentro. É recuperável — "Recuperar senha" resolve — mas só se alguém
      // souber que aconteceu.
      reportSigaEvent("tenant.provisioning.invite.failed", {
        tenant_id: result.tenantId,
        school_id: trace.schoolId,
        source: opts.source,
        reason: "no_password_and_no_invite",
      });
    }
    return result;
  } catch (error) {
    reportSigaError("tenant.provisioning.failed", error, {
      tenant_id: trace.tenantId,
      school_id: trace.schoolId,
      stage: trace.stage,
      source: opts.source,
      duration_ms: Date.now() - startedAt,
    });
    throw error;
  }
}

async function runProvisioning(
  data: CreateSchoolWizardInput,
  opts: { auditUserId: string | null; source: "platform_admin" | "public_signup" },
  trace: ProvisioningTrace,
): Promise<ProvisioningResult> {
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
  trace.tenantId = tenantId;
  trace.stage = "subscription";

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
    // (nesta altura ainda não há domínio nem escola — o delete directo basta)
  }

  /**
   * Rollback do tenant. O Postgres recusa apagar `tenants` enquanto
   * subscrições/domínios/escolas ainda o referenciarem, e o erro era
   * descartado — cada provisionamento falhado deixava um tenant órfão a
   * ocupar o slug para sempre. Apagar por ordem inversa das dependências.
   */
  const cleanupTenant = async () => {
    for (const table of ["saas_audit_logs", "tenant_usage", "tenant_domains", "subscriptions"]) {
      await db.from(table).delete().eq("tenant_id", tenantId);
    }
    const { error } = await db.from("tenants").delete().eq("id", tenantId);
    if (error) {
      // A escola que ficou (ver cleanupSchool) ainda o referencia. Marca-se como
      // falhado e liberta-se o endereço, para a escola poder tentar de novo.
      await db
        .from("tenants")
        .update({
          status: "provisioning_failed",
          slug: `${data.slug}-falhou-${tenantId.slice(0, 8)}`,
        })
        .eq("id", tenantId);
      // Alertável de propósito: um tenant que não é apagado fica a ocupar o
      // slug para sempre, e a escola que tentar o mesmo endereço a seguir
      // recebe "já está em uso" sem ninguém perceber porquê.
      reportSigaError("tenant.provisioning.rollback.failed", error, {
        tenant_id: tenantId,
        entity: "tenant",
        entity_id: tenantId,
      });
    }
  };

  /**
   * Idem para a escola: papéis, memberships e perfil antes da própria escola.
   * Também apaga a conta auth.users do administrador — sem isto, uma falha a
   * meio do provisionamento (comum no signup público, sem operador a
   * acompanhar) deixava uma conta órfã para sempre: tudo o resto revertido,
   * mas a identidade em auth.users continuava a existir, sem escola, sem
   * perfil, sem propósito. Mesmo princípio de inviteSystemUser: nunca deixar
   * conta "fantasma" para trás.
   */
  const cleanupSchool = async (schoolId: string, adminUserId: string | null) => {
    await db.from("member_roles").delete().eq("school_id", schoolId);
    await db.from("role_permissions").delete().eq("school_id", schoolId);
    await db.from("roles").delete().eq("school_id", schoolId);
    await db.from("school_memberships").delete().eq("school_id", schoolId);
    // O que o bootstrap cria. `school_settings.changed_by` e
    // `enrollment_forms.created_by` apontam para a conta do administrador e,
    // sem os apagar, a conta ficava presa e o e-mail não servia para tentar
    // de novo (a 2026-09-28 foi o que aconteceu). Ordem das dependências.
    for (const table of [
      "school_settings",
      "document_sequences",
      "enrollment_forms",
      "fee_items",
      "fee_plans",
      "academic_years",
    ]) {
      await db.from(table).delete().eq("school_id", schoolId);
    }
    if (adminUserId) {
      await db.from("profiles").delete().eq("id", adminUserId);
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // `deleteUser` devolve o erro, não o lança.
        const { error: deleteErr } = await supabaseAdmin.auth.admin.deleteUser(adminUserId);
        if (deleteErr) throw deleteErr;
      } catch (deleteErr) {
        reportSigaError("tenant.provisioning.rollback.failed", deleteErr, {
          school_id: schoolId,
          user_id: adminUserId,
          entity: "auth_user",
          entity_id: adminUserId,
        });
      }
    }
    const { error } = await db.from("schools").delete().eq("id", schoolId);
    if (error) {
      // Depois do bootstrap há linhas em `audit_logs` (só se acrescenta; não se
      // apagam) e a escola já não se pode apagar. Fica arquivada.
      await db.from("schools").update({ status: "archived" }).eq("id", schoolId);
      reportSigaError("tenant.provisioning.rollback.failed", error, {
        school_id: schoolId,
        entity: "school",
        entity_id: schoolId,
      });
    }
  };

  trace.stage = "domain";
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

  trace.stage = "school";
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
      city: data.city || data.municipality || "Luanda",
      province: data.province || null,
      municipality: data.municipality || null,
      commune: data.commune || null,
      neighborhood: data.neighborhood || null,
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
  trace.schoolId = schoolId;
  trace.stage = "admin";

  let adminUserId: string | null = null;
  let adminAccount: SchoolAdminAccount | null = null;
  try {
    // A conta é criada sem depender do mailer e o link de acesso é entregue
    // como efeito secundário best-effort — ver admin-account.ts. Antes disto,
    // `inviteUserByEmail` fazia o provisionamento inteiro falhar sempre que a
    // Supabase recusava entregar o e-mail.
    adminAccount = await createSchoolAdminAccount(db, {
      email: data.admin_email,
      fullName: data.admin_name,
      schoolName: data.name,
      password: data.admin_password,
    });
    adminUserId = adminAccount.userId;

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

    // member_roles.school_id é NOT NULL — sem ele o provisionamento falhava
    // sempre com 23502 no último passo do administrador.
    const { error: memberRoleErr } = await db
      .from("member_roles")
      .insert({ school_id: schoolId, membership_id: membership.id, role_id: roleId });
    if (memberRoleErr) {
      throw publicDatabaseError(
        memberRoleErr,
        "Não foi possível atribuir o papel de administrador.",
      );
    }
  } catch (err) {
    await cleanupSchool(schoolId, adminUserId);
    if (adminUserId) await db.auth.admin.deleteUser(adminUserId).catch(() => undefined);
    await cleanupTenant();
    throw err instanceof Error ? err : new Error("Falha ao provisionar o administrador da escola.");
  }

  trace.stage = "usage";
  await syncTenantUsageForSchool(tenantId, schoolId);

  // Invariante: se chegámos aqui, o bloco try/catch acima já criou o
  // administrador com sucesso (qualquer falha antes disto relança e sai
  // mais cedo) — adminUserId nunca é null neste ponto.
  if (!adminUserId) {
    throw new Error("Administrador da escola não foi provisionado antes do bootstrap.");
  }

  trace.stage = "bootstrap";
  const { seeded: bootstrapSeeded } = await bootstrapSchoolDefaults(db, {
    schoolId,
    schoolName: data.name,
    slug: data.slug,
    adminUserId,
  });

  // Natureza da instituição escolhida no registo: vai para o mesmo sítio que
  // Definições → Escola lê e grava. Falhar aqui não desfaz a escola.
  if (data.school_type && adminUserId) {
    const { error: institutionErr } = await db.from("school_settings").insert({
      school_id: schoolId,
      domain: "institution",
      version: 1,
      value: { school_type: data.school_type },
      changed_by: adminUserId,
    });
    if (institutionErr) {
      console.warn("[provisioning] natureza da instituição:", institutionErr.message);
    }
  }

  // Confirmar o conjunto antes de declarar sucesso. Cada passo acima já lança
  // em caso de erro, mas nada afirmava o resultado — e uma escola meio-criada é
  // pior do que uma criação falhada: o cliente recebe confirmação, tenta entrar,
  // e encontra um produto partido sem ninguém saber porquê.
  trace.stage = "verify";
  const gaps = await findProvisioningGaps(db, { tenantId, schoolId, adminUserId });
  if (gaps.length > 0) {
    await cleanupSchool(schoolId, adminUserId);
    await db.auth.admin.deleteUser(adminUserId).catch(() => undefined);
    await cleanupTenant();
    throw new Error(describeProvisioningGaps(gaps));
  }

  trace.stage = "audit";
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
      admin_invite_delivered: adminAccount?.inviteDelivered ?? false,
      admin_invite_channel: adminAccount?.inviteChannel ?? null,
      admin_invite_error: adminAccount?.deliveryError ?? null,
      admin_password_set: adminAccount?.passwordSet ?? false,
    },
  });

  return {
    success: true,
    tenantId,
    slug: data.slug,
    hostname: getPlatformSubdomain(data.slug),
    bootstrapSeeded,
    adminInviteDelivered: adminAccount?.inviteDelivered ?? false,
    adminPasswordSet: adminAccount?.passwordSet ?? false,
    // O link de definição de senha nunca sai no signup público: só quem já é
    // admin de plataforma o recebe, para o entregar ao director.
    adminSetupUrl: opts.source === "platform_admin" ? (adminAccount?.setupUrl ?? null) : null,
  };
}
