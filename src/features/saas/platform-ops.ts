import type { Json, TablesUpdate } from "@/integrations/supabase/types";
import { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { isPlatformOwnedHostname } from "@/lib/saas/platform-domain";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { sumTenantUsageStudents, usageFromTenantRow } from "@/features/saas/tenant-access";
import type {
  SaaSStats,
  SaasAuditLogRow,
  PlatformAdminRow,
  SubscriptionRow,
  SubscriptionLifecycle,
  Tenant,
  TenantDomain,
  TenantStatus,
} from "@/features/saas/types";
import { isMissingTableError, profileFromRow } from "@/features/saas/tenant-billing";
import {
  addMonthsClamped,
  isInTrial,
  trialExtensionError,
  isTrialExpired,
  monthlyRevenueOf,
  resolveStatusChange,
  type TenantBillingProfile,
} from "@/features/saas/tenant-billing-rules";
import {
  aggregateGatewayWebhookMetrics,
  emptyGatewayWebhookMetrics,
  type GatewayWebhookEventRow,
} from "@/features/finance/gateway-webhook-metrics";
import { summarizeAdoption, type CatalogAdoption } from "@/features/education-catalog/adoption";
import { selectAllPages } from "@/features/import/engine/paged";
import {
  verifyCustomDomainDns,
  expectedCnameTarget,
  dnsVerifyTxtHost,
  dnsVerifyToken,
} from "@/features/saas/domain-verify";

async function resolveAuthUserIdByEmail(
  db: Awaited<ReturnType<typeof loadSgaAdminClient>>,
  email: string,
): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw publicDatabaseError(error, "Não foi possível procurar utilizadores.");
    const match = data.users.find((user) => user.email?.toLowerCase() === normalized);
    if (match) return match.id;
    if (data.users.length < 200) break;
  }
  return null;
}

async function syncTenantSubscriptionRecord(
  db: Awaited<ReturnType<typeof loadSgaAdminClient>>,
  input: {
    tenantId: string;
    planId: string;
    status: SubscriptionLifecycle;
    periodEnd?: string;
    /** Não mexer no `current_period_end` de uma assinatura que já existe. */
    keepPeriodEnd?: boolean;
  },
): Promise<void> {
  const now = new Date().toISOString();
  const periodEnd =
    input.periodEnd ?? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

  const { data: existing, error: loadErr } = await db
    .from("subscriptions")
    .select("id")
    .eq("tenant_id", input.tenantId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (loadErr) throw publicDatabaseError(loadErr, "Não foi possível carregar a subscrição.");

  if (existing?.id) {
    const { error } = await db
      .from("subscriptions")
      .update({
        plan_id: input.planId,
        status: input.status,
        ...(input.keepPeriodEnd ? {} : { current_period_end: periodEnd }),
        updated_at: now,
      })
      .eq("id", existing.id);
    if (error) throw publicDatabaseError(error, "Não foi possível actualizar a subscrição.");
    return;
  }

  const { error } = await db.from("subscriptions").insert({
    tenant_id: input.tenantId,
    plan_id: input.planId,
    status: input.status,
    current_period_start: now,
    current_period_end: periodEnd,
  });
  if (error) throw publicDatabaseError(error, "Não foi possível criar a subscrição.");
}

export async function fetchSaaSStats(): Promise<SaaSStats> {
  const db = await loadSgaAdminClient();
  const { data: tenants, error: tenantErr } = await db
    .from("tenants")
    .select(
      "id, status, subscription_status, trial_ends_at, billing_exempt, plan_id, max_students, max_storage_gb, plans(price_aoa_monthly, price_aoa_yearly)",
    );
  if (tenantErr) throw publicDatabaseError(tenantErr, "Não foi possível carregar as escolas.");

  const { data: usageRows, error: usageErr } = await db
    .from("tenant_usage")
    .select("tenant_id, active_students_count");
  if (usageErr) throw publicDatabaseError(usageErr, "Não foi possível carregar a utilização.");
  const studentsByTenant = new Map(
    (usageRows ?? []).map((u) => [u.tenant_id as string, Number(u.active_students_count ?? 0)]),
  );

  // Condições próprias de cobrança (por aluno, valor fixo, descontos). Sem a tabela
  // (migração por aplicar) conta o preço de tabela do plano, como antes.
  const profiles = new Map<string, TenantBillingProfile>();
  const { data: profileRows, error: profileErr } = await (
    db as unknown as {
      from: (t: string) => {
        select: (c: string) => Promise<{ data: unknown[] | null; error: { code?: string } | null }>;
      };
    }
  )
    .from("tenant_billing_profiles")
    .select("*");
  if (profileErr && !isMissingTableError(profileErr)) {
    throw publicDatabaseError(profileErr as never, "Não foi possível carregar a cobrança.");
  }
  for (const row of (profileRows ?? []) as Array<Record<string, unknown>>) {
    const profile = profileFromRow(row);
    profiles.set(profile.tenantId, profile);
  }

  const now = new Date();
  const stats: SaaSStats = {
    totalTenants: tenants?.length ?? 0,
    activeTenants: 0,
    trialTenants: 0,
    suspendedTenants: 0,
    pastDueTenants: 0,
    trialExpiredTenants: 0,
    exemptTenants: 0,
    totalStudents: sumTenantUsageStudents(usageRows),
    mrrAoa: 0,
    arrAoa: 0,
    totalStorageGb: 0,
  };

  for (const t of tenants ?? []) {
    const trialExpired = isTrialExpired(t, now);
    const inTrial = isInTrial(t);
    if (t.status === "active" && !inTrial && !t.billing_exempt) stats.activeTenants += 1;
    if (inTrial && !trialExpired) stats.trialTenants += 1;
    if (t.status === "suspended") stats.suspendedTenants += 1;
    if (t.status === "past_due") stats.pastDueTenants += 1;
    if (t.billing_exempt) stats.exemptTenants += 1;
    if (trialExpired) stats.trialExpiredTenants += 1;
    stats.totalStorageGb += t.max_storage_gb || 10;
    stats.mrrAoa += monthlyRevenueOf(
      {
        tenantStatus: String(t.status),
        subscriptionStatus: t.subscription_status ?? null,
        billingExempt: Boolean(t.billing_exempt),
        profile: profiles.get(t.id) ?? null,
        plan:
          (t.plans as unknown as { price_aoa_monthly?: number; price_aoa_yearly?: number }) ?? null,
        activeStudents: studentsByTenant.get(t.id) ?? 0,
      },
      now,
    );
  }
  stats.mrrAoa = Math.round(stats.mrrAoa * 100) / 100;
  stats.arrAoa = Math.round(stats.mrrAoa * 12 * 100) / 100;
  return stats;
}

export async function fetchAllTenants(): Promise<Tenant[]> {
  const db = await loadSgaAdminClient();
  const { data, error } = await db
    .from("tenants")
    .select(
      "*, plans(*), tenant_usage(active_students_count, active_staff_count, storage_bytes_used, last_calculated_at)",
    )
    .order("created_at", { ascending: false });
  if (error) throw publicDatabaseError(error, "Não foi possível carregar as escolas.");
  return ((data as unknown as Tenant[]) ?? []).map((tenant) => {
    const usage = tenant.tenant_usage;
    const usageRow = Array.isArray(usage) ? usage[0] : usage;
    return {
      ...tenant,
      active_students_count: usageFromTenantRow(
        usage as { active_students_count?: number | null }[] | undefined,
      ),
      usage_last_calculated_at: usageRow?.last_calculated_at,
    };
  });
}

export async function updateTenantStatus(input: {
  tenantId: string;
  status: TenantStatus;
  userId: string;
}): Promise<{ success: true }> {
  const db = await loadSgaAdminClient();
  const { data: current, error: loadErr } = await db
    .from("tenants")
    .select("status, subscription_status, billing_exempt")
    .eq("id", input.tenantId)
    .maybeSingle();
  if (loadErr) throw publicDatabaseError(loadErr, "Não foi possível carregar a escola.");
  if (!current) throw new Error("Escola não encontrada.");
  const decision = resolveStatusChange(
    {
      status: String(current.status),
      subscription_status: current.subscription_status as string | null,
      billing_exempt: current.billing_exempt as boolean | null,
    },
    input.status,
  );
  if ("error" in decision) throw new Error(decision.error);
  const status = decision.status as TenantStatus;
  const { error } = await db
    .from("tenants")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", input.tenantId);
  if (error) throw publicDatabaseError(error, "Não foi possível atualizar o estado da escola.");
  await db.from("saas_audit_logs").insert({
    tenant_id: input.tenantId,
    user_id: input.userId,
    action: "TENANT_STATUS_CHANGED",
    entity: "tenant",
    entity_id: input.tenantId,
    metadata: { status, requested: input.status, previous: current.status },
  });
  return { success: true };
}

export async function updateTenantSubscription(input: {
  tenantId: string;
  plan_code?: "start" | "professional" | "business" | "enterprise";
  extend_trial_days?: number;
  confirm_payment_billing?: "monthly" | "yearly";
  confirm_payment_months?: 1 | 3 | 6 | 12;
  payment_reference?: string;
  userId: string;
}): Promise<{ success: true }> {
  const db = await loadSgaAdminClient();
  const { data: tenant, error: tenantErr } = await db
    .from("tenants")
    .select("id, status, subscription_status, trial_ends_at, plan_id")
    .eq("id", input.tenantId)
    .maybeSingle();
  if (tenantErr) throw publicDatabaseError(tenantErr, "Não foi possível carregar a escola.");
  if (!tenant) throw new Error("Escola não encontrada.");
  if (input.extend_trial_days && !input.confirm_payment_months && !input.confirm_payment_billing) {
    const refusal = trialExtensionError({
      status: String(tenant.status),
      subscription_status: tenant.subscription_status as string | null,
    });
    if (refusal) throw new Error(refusal);
  }

  const patch: TablesUpdate<"tenants"> = { updated_at: new Date().toISOString() };
  const metadata: Record<string, unknown> = {};

  if (input.plan_code) {
    const { data: plan, error: planErr } = await db
      .from("plans")
      .select("id, max_students, max_storage_gb")
      .eq("code", input.plan_code)
      .maybeSingle();
    if (planErr) throw publicDatabaseError(planErr, "Não foi possível carregar o plano.");
    if (!plan) throw new Error("Plano inválido.");
    patch.plan_id = plan.id;
    patch.max_students = plan.max_students;
    patch.max_storage_gb = plan.max_storage_gb;
    metadata.plan_code = input.plan_code;
  }

  if (input.extend_trial_days) {
    const currentEnd = tenant.trial_ends_at ? new Date(tenant.trial_ends_at) : new Date();
    const base = currentEnd.getTime() < Date.now() ? new Date() : currentEnd;
    const nextEnd = new Date(base);
    nextEnd.setDate(nextEnd.getDate() + input.extend_trial_days);
    patch.trial_ends_at = nextEnd.toISOString();
    patch.subscription_status = "trialing";
    metadata.extend_trial_days = input.extend_trial_days;
    metadata.trial_ends_at = patch.trial_ends_at;
  }

  // Pagamento confirmado: a assinatura passa a activa até ao fim do período
  // pago, contado a partir de hoje ou do fim do período ainda em curso.
  let paidUntil: string | null = null;
  const paidMonths =
    input.confirm_payment_months ??
    (input.confirm_payment_billing === "yearly"
      ? 12
      : input.confirm_payment_billing === "monthly"
        ? 1
        : null);
  if (paidMonths) {
    const { data: current } = await db
      .from("subscriptions")
      .select("status, current_period_end")
      .eq("tenant_id", input.tenantId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const currentEnd =
      current?.status === "active" && current.current_period_end
        ? new Date(current.current_period_end)
        : null;
    const base = currentEnd && currentEnd.getTime() > Date.now() ? currentEnd : new Date();
    paidUntil = addMonthsClamped(base, paidMonths).toISOString();
    patch.subscription_status = "active";
    patch.status = "active";
    metadata.payment_confirmed = true;
    metadata.billing = paidMonths === 12 ? "yearly" : paidMonths === 1 ? "monthly" : undefined;
    metadata.months = paidMonths;
    if (input.payment_reference) metadata.payment_reference = input.payment_reference;
    metadata.paid_until = paidUntil;
  }

  if (!Object.keys(patch).some((key) => key !== "updated_at")) {
    throw new Error("Nada para actualizar.");
  }

  const { error } = await db.from("tenants").update(patch).eq("id", input.tenantId);
  if (error) throw publicDatabaseError(error, "Não foi possível actualizar a subscrição.");

  await db.from("saas_audit_logs").insert({
    tenant_id: input.tenantId,
    user_id: input.userId,
    action: "TENANT_SUBSCRIPTION_UPDATED",
    entity: "tenant",
    entity_id: input.tenantId,
    metadata: metadata as Json,
  });

  const { data: updatedTenant, error: reloadErr } = await db
    .from("tenants")
    .select("plan_id, subscription_status, trial_ends_at")
    .eq("id", input.tenantId)
    .maybeSingle();
  if (reloadErr) throw publicDatabaseError(reloadErr, "Não foi possível recarregar a escola.");
  if (updatedTenant?.plan_id) {
    await syncTenantSubscriptionRecord(db, {
      tenantId: input.tenantId,
      planId: updatedTenant.plan_id as string,
      status: (updatedTenant.subscription_status as SubscriptionLifecycle) || "active",
      // Só um pagamento ou uma extensão de trial mexem no fim do período. Mudar só o
      // plano mantinha-o igual ao fim do trial antigo e a tarefa diária punha uma
      // escola paga em atraso.
      periodEnd:
        paidUntil ??
        (input.extend_trial_days ? (updatedTenant.trial_ends_at as string | null) : null) ??
        undefined,
      keepPeriodEnd: !paidUntil && !input.extend_trial_days,
    });
  }

  return { success: true };
}

export async function fetchAllSubscriptions(): Promise<SubscriptionRow[]> {
  const db = await loadSgaAdminClient();
  const { data, error } = await db
    .from("subscriptions")
    .select("*, tenants(name, slug), plans(name, code, price_aoa_monthly)")
    .order("created_at", { ascending: false });
  if (error) throw publicDatabaseError(error, "Não foi possível carregar subscrições.");

  return ((data as Array<Record<string, unknown>>) ?? []).map((row) => {
    const tenant = row.tenants as { name?: string; slug?: string } | null;
    const plan = row.plans as { name?: string; code?: string; price_aoa_monthly?: number } | null;
    return {
      id: row.id as string,
      tenant_id: row.tenant_id as string,
      plan_id: row.plan_id as string,
      status: row.status as SubscriptionLifecycle,
      current_period_start: row.current_period_start as string,
      current_period_end: row.current_period_end as string,
      cancel_at_period_end: Boolean(row.cancel_at_period_end),
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
      tenant_name: tenant?.name ?? null,
      tenant_slug: tenant?.slug ?? null,
      plan_name: plan?.name ?? null,
      plan_code: plan?.code ?? null,
      price_aoa_monthly: plan?.price_aoa_monthly ?? null,
    };
  });
}

export async function backfillTenantSubscriptions(input: {
  actorUserId: string;
}): Promise<{ success: true; created: number }> {
  const db = await loadSgaAdminClient();
  const { data: tenants, error } = await db
    .from("tenants")
    .select("id, plan_id, subscription_status, trial_ends_at")
    .not("plan_id", "is", null);
  if (error) throw publicDatabaseError(error, "Não foi possível carregar escolas.");

  let created = 0;
  for (const tenant of tenants ?? []) {
    const { count, error: countErr } = await db
      .from("subscriptions")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenant.id as string);
    if (countErr) throw publicDatabaseError(countErr, "Não foi possível verificar subscrições.");
    if ((count ?? 0) > 0) continue;

    await syncTenantSubscriptionRecord(db, {
      tenantId: tenant.id as string,
      planId: tenant.plan_id as string,
      status: (tenant.subscription_status as SubscriptionLifecycle) || "active",
      periodEnd: (tenant.trial_ends_at as string | null) ?? undefined,
    });
    created += 1;
  }

  if (created > 0) {
    await db.from("saas_audit_logs").insert({
      user_id: input.actorUserId,
      action: "SUBSCRIPTIONS_BACKFILLED",
      entity: "subscription",
      metadata: { created },
    });
  }

  return { success: true, created };
}

export async function fetchPlatformAdmins(): Promise<PlatformAdminRow[]> {
  const db = await loadSgaAdminClient();
  const { data, error } = await db
    .from("platform_admins")
    .select("user_id, created_at")
    .order("created_at", { ascending: true });
  if (error)
    throw publicDatabaseError(error, "Não foi possível listar administradores da plataforma.");

  const rows = await Promise.all(
    (data ?? []).map(async (row) => {
      const { data: authUser } = await db.auth.admin.getUserById(row.user_id as string);
      return {
        user_id: row.user_id as string,
        email: authUser.user?.email ?? null,
        created_at: row.created_at as string,
      };
    }),
  );
  return rows;
}

export async function grantPlatformAdmin(input: {
  email: string;
  actorUserId: string;
}): Promise<{ success: true; userId: string }> {
  const db = await loadSgaAdminClient();
  const userId = await resolveAuthUserIdByEmail(db, input.email);
  if (!userId) throw new Error("Utilizador Auth não encontrado com este e-mail.");

  const { error } = await db.from("platform_admins").insert({ user_id: userId });
  if (error) {
    if (error.code === "23505") throw new Error("Esta conta já é administradora da plataforma.");
    throw publicDatabaseError(error, "Não foi possível conceder acesso.");
  }

  await db.from("saas_audit_logs").insert({
    user_id: input.actorUserId,
    action: "PLATFORM_ADMIN_GRANTED",
    entity: "platform_admin",
    entity_id: userId,
    metadata: { email: input.email.trim().toLowerCase() },
  });
  return { success: true, userId };
}

export async function revokePlatformAdmin(input: {
  userId: string;
  actorUserId: string;
}): Promise<{ success: true }> {
  if (input.userId === input.actorUserId) {
    throw new Error("Não pode remover a sua própria conta de administrador.");
  }

  const db = await loadSgaAdminClient();
  const { count, error: countErr } = await db
    .from("platform_admins")
    .select("*", { count: "exact", head: true });
  if (countErr) throw publicDatabaseError(countErr, "Não foi possível verificar administradores.");
  if ((count ?? 0) <= 1) throw new Error("Deve existir pelo menos um administrador da plataforma.");

  const { error } = await db.from("platform_admins").delete().eq("user_id", input.userId);
  if (error) throw publicDatabaseError(error, "Não foi possível revogar acesso.");

  await db.from("saas_audit_logs").insert({
    user_id: input.actorUserId,
    action: "PLATFORM_ADMIN_REVOKED",
    entity: "platform_admin",
    entity_id: input.userId,
    metadata: {},
  });
  return { success: true };
}

export async function fetchSaasAuditLogs(
  limit = 50,
  actions: string[] = [],
): Promise<SaasAuditLogRow[]> {
  const db = await loadSgaAdminClient();
  let query = db
    .from("saas_audit_logs")
    .select("*, tenants(name, slug)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (actions.length) query = query.in("action", actions);
  const { data, error } = await query;
  if (error) throw publicDatabaseError(error, "Não foi possível carregar a auditoria.");

  return ((data as Array<Record<string, unknown>>) ?? []).map((row) => {
    const tenant = row.tenants as { name?: string; slug?: string } | null;
    return {
      id: row.id as string,
      tenant_id: (row.tenant_id as string | null) ?? null,
      user_id: (row.user_id as string | null) ?? null,
      action: row.action as string,
      entity: row.entity as string,
      entity_id: (row.entity_id as string | null) ?? null,
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      created_at: row.created_at as string,
      tenant_name: tenant?.name ?? null,
      tenant_slug: tenant?.slug ?? null,
    };
  });
}

export async function fetchGatewayWebhookMetrics(limit = 200) {
  const db = await loadSgaAdminClient();
  const capped = Math.min(500, Math.max(50, limit));
  const { data, error } = await db
    .from("finance_gateway_webhook_events")
    .select(
      "id, school_id, channel, http_status, ok, message, reference, invoice_id, amount, created_at, schools(name, tenants(name, slug))",
    )
    .order("created_at", { ascending: false })
    .limit(capped);
  if (error) {
    if (error.code === "42P01" || /does not exist|schema cache/i.test(error.message ?? "")) {
      return emptyGatewayWebhookMetrics();
    }
    throw publicDatabaseError(error, "Não foi possível carregar métricas de webhook.");
  }

  const events: GatewayWebhookEventRow[] = ((data as Array<Record<string, unknown>>) ?? []).map(
    (row) => {
      const school = row.schools as {
        name?: string;
        tenants?: { name?: string; slug?: string } | null;
      } | null;
      const tenant = school?.tenants ?? null;
      return {
        id: row.id as string,
        school_id: (row.school_id as string | null) ?? null,
        channel: row.channel as string,
        http_status: row.http_status as number,
        ok: Boolean(row.ok),
        message: String(row.message ?? ""),
        reference: (row.reference as string | null) ?? null,
        invoice_id: (row.invoice_id as string | null) ?? null,
        amount: row.amount != null ? Number(row.amount) : null,
        created_at: row.created_at as string,
        school_name: school?.name ?? null,
        tenant_name: tenant?.name ?? null,
        tenant_slug: tenant?.slug ?? null,
      };
    },
  );

  const metrics = aggregateGatewayWebhookMetrics(events);
  if (!metrics.available) return metrics;

  const lastRateAlert = await fetchLastGatewayRateAlert(db);
  return { ...metrics, lastRateAlert };
}

async function fetchLastGatewayRateAlert(db: Awaited<ReturnType<typeof loadSgaAdminClient>>) {
  const { data, error } = await db
    .from("saas_audit_logs")
    .select("created_at, metadata")
    .eq("action", "GATEWAY_FAILURE_RATE_ALERT")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (error.code === "42P01" || /does not exist|schema cache/i.test(error.message ?? "")) {
      return null;
    }
    throw publicDatabaseError(error, "Não foi possível carregar alertas de taxa.");
  }
  if (!data?.created_at) return null;
  const metadata = (data.metadata ?? {}) as Record<string, unknown>;
  return {
    created_at: data.created_at as string,
    failure_rate: Number(metadata.failure_rate ?? 0),
    total_24h: Number(metadata.total_24h ?? 0),
    failed_24h: Number(metadata.failed_24h ?? 0),
    reason: String(metadata.reason ?? ""),
  };
}

export async function fetchAllTenantDomains(): Promise<TenantDomain[]> {
  const db = await loadSgaAdminClient();
  const { data, error } = await db
    .from("tenant_domains")
    .select("*, tenants(name, slug)")
    .order("created_at", { ascending: false });
  if (error) throw publicDatabaseError(error, "Não foi possível carregar domínios.");

  return ((data as Array<Record<string, unknown>>) ?? []).map((row) => {
    const tenant = row.tenants as { name?: string; slug?: string } | null;
    return {
      id: row.id as string,
      tenant_id: row.tenant_id as string,
      hostname: row.hostname as string,
      type: row.type as TenantDomain["type"],
      status: row.status as TenantDomain["status"],
      ssl_status: (row.ssl_status as string) ?? "pending",
      verified_at: row.verified_at as string | undefined,
      created_at: row.created_at as string,
      tenant_name: tenant?.name ?? null,
      tenant_slug: tenant?.slug ?? null,
    };
  });
}

export async function registerTenantDomain(input: {
  tenantId: string;
  hostname: string;
  actorUserId: string;
}): Promise<{ success: true; domainId: string }> {
  const db = await loadSgaAdminClient();
  const { data: tenant, error: tenantErr } = await db
    .from("tenants")
    .select("id, slug")
    .eq("id", input.tenantId)
    .maybeSingle();
  if (tenantErr) throw publicDatabaseError(tenantErr, "Não foi possível carregar a escola.");
  if (!tenant) throw new Error("Escola não encontrada.");

  const hostname = input.hostname.trim().toLowerCase();
  if (isPlatformOwnedHostname(hostname)) {
    throw new Error(
      "Os endereços da plataforma são criados no provisionamento, não como domínio próprio.",
    );
  }

  const { data: domain, error } = await db
    .from("tenant_domains")
    .insert({
      tenant_id: input.tenantId,
      hostname,
      type: "custom_domain",
      status: "pending",
      ssl_status: "pending",
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("Este hostname já está registado.");
    throw publicDatabaseError(error, "Não foi possível registar o domínio.");
  }

  await db.from("saas_audit_logs").insert({
    tenant_id: input.tenantId,
    user_id: input.actorUserId,
    action: "TENANT_DOMAIN_REGISTERED",
    entity: "tenant_domain",
    entity_id: domain.id as string,
    metadata: { hostname, tenant_slug: tenant.slug },
  });
  return { success: true, domainId: domain.id as string };
}

export async function updateTenantDomainStatus(input: {
  domainId: string;
  status: TenantDomain["status"];
  actorUserId: string;
}): Promise<{ success: true }> {
  const db = await loadSgaAdminClient();
  const { data: existing, error: loadErr } = await db
    .from("tenant_domains")
    .select("id, tenant_id, hostname, type")
    .eq("id", input.domainId)
    .maybeSingle();
  if (loadErr) throw publicDatabaseError(loadErr, "Não foi possível carregar o domínio.");
  if (!existing) throw new Error("Domínio não encontrado.");
  if (existing.type === "siga_subdomain" && input.status === "failed") {
    throw new Error("Não pode desactivar o subdomínio SIGA principal.");
  }

  const patch: TablesUpdate<"tenant_domains"> = {
    status: input.status,
    ssl_status: input.status === "active" ? "active" : "pending",
    verified_at: input.status === "active" ? new Date().toISOString() : null,
  };
  const { error } = await db.from("tenant_domains").update(patch).eq("id", input.domainId);
  if (error) throw publicDatabaseError(error, "Não foi possível actualizar o domínio.");

  await db.from("saas_audit_logs").insert({
    tenant_id: existing.tenant_id as string,
    user_id: input.actorUserId,
    action: "TENANT_DOMAIN_STATUS_CHANGED",
    entity: "tenant_domain",
    entity_id: input.domainId,
    metadata: { hostname: existing.hostname, status: input.status },
  });
  return { success: true };
}

export async function verifyAndActivateTenantDomain(input: {
  domainId: string;
  actorUserId: string;
}): Promise<{ success: true; method: "cname" | "txt" }> {
  const db = await loadSgaAdminClient();
  const { data: domain, error: loadErr } = await db
    .from("tenant_domains")
    .select("id, tenant_id, hostname, type, status, tenants(slug)")
    .eq("id", input.domainId)
    .maybeSingle();
  if (loadErr) throw publicDatabaseError(loadErr, "Não foi possível carregar o domínio.");
  if (!domain) throw new Error("Domínio não encontrado.");
  if (domain.type !== "custom_domain") {
    throw new Error("Só domínios customizados exigem verificação DNS.");
  }
  if (domain.status === "active") {
    return { success: true, method: "cname" };
  }

  const tenant = domain.tenants as { slug?: string } | null;
  const slug = tenant?.slug;
  if (!slug) throw new Error("Escola sem slug — não é possível verificar DNS.");

  const check = await verifyCustomDomainDns(
    String(domain.hostname),
    slug,
    String(domain.tenant_id),
  );
  if (!check.ok) {
    throw new Error(check.reason);
  }

  const { error } = await db
    .from("tenant_domains")
    .update({
      status: "active",
      ssl_status: "active",
      verified_at: new Date().toISOString(),
    })
    .eq("id", input.domainId);
  if (error) throw publicDatabaseError(error, "Não foi possível activar o domínio.");

  await db.from("saas_audit_logs").insert({
    tenant_id: domain.tenant_id as string,
    user_id: input.actorUserId,
    action: "TENANT_DOMAIN_VERIFIED",
    entity: "tenant_domain",
    entity_id: input.domainId,
    metadata: {
      hostname: domain.hostname,
      method: check.method,
      expected_cname: expectedCnameTarget(slug),
    },
  });

  return { success: true, method: check.method };
}

export function domainDnsInstructions(hostname: string, tenantSlug: string, tenantId: string) {
  return {
    cnameHost: hostname.trim().toLowerCase(),
    cnameTarget: expectedCnameTarget(tenantSlug),
    txtHost: dnsVerifyTxtHost(hostname),
    txtValue: dnsVerifyToken(tenantId),
  };
}

/** Link temporário (5 min) para a equipa ver um comprovativo de pagamento. */
export async function signedBillingProofUrl(path: string): Promise<string> {
  if (!/^[0-9a-f-]{36}\/[\w.-]+\.(pdf|png|jpg|webp)$/i.test(path)) {
    throw new Error("Comprovativo inválido.");
  }
  const db = await loadSgaAdminClient();
  const { data, error } = await db.storage.from("billing-proofs").createSignedUrl(path, 300);
  if (error || !data?.signedUrl) throw new Error("Comprovativo não encontrado.");
  return data.signedUrl;
}

type AdoptionTable = "subjects" | "programs";
const ADOPTION_COLUMN: Record<AdoptionTable, string> = {
  subjects: "catalog_subject_code",
  programs: "catalog_course_code",
};

/**
 * Disciplinas e cursos de todas as escolas, com a ligação ao catálogo se a
 * migração 20261012120000 já estiver aplicada. A sonda (uma linha) diz se a
 * coluna existe; sem ela, conta só o total e o que o nome reconhece.
 */
export async function fetchCatalogAdoption(): Promise<CatalogAdoption> {
  const db = await loadSgaAdminClient();
  const untyped = db as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        limit: (n: number) => PromiseLike<{ error: { code?: string; message?: string } | null }>;
        is: (
          column: string,
          value: null,
        ) => {
          order: (
            column: string,
            options: { ascending: boolean },
          ) => {
            range: (
              from: number,
              to: number,
            ) => PromiseLike<{
              data: Array<Record<string, unknown>> | null;
              error: { message: string } | null;
            }>;
          };
        };
        order: (
          column: string,
          options: { ascending: boolean },
        ) => {
          range: (
            from: number,
            to: number,
          ) => PromiseLike<{
            data: Array<Record<string, unknown>> | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
  const probe = await untyped.from("subjects").select("id, catalog_subject_code").limit(1);
  const missing =
    probe.error &&
    /42703|PGRST204/.test(String(probe.error.code ?? "")) &&
    String(probe.error.message ?? "").includes("catalog_subject_code");
  if (probe.error && !missing) {
    throw publicDatabaseError(
      probe.error as { message: string },
      "Não foi possível ler as disciplinas.",
    );
  }
  const linkAvailable = !missing;

  const load = async (table: AdoptionTable) => {
    const columns = linkAvailable
      ? `id, school_id, name, ${ADOPTION_COLUMN[table]}`
      : "id, school_id, name";
    const rows = await selectAllPages<Record<string, unknown>>(
      (from, to) => {
        const query = untyped.from(table).select(columns);
        const ordered =
          table === "subjects"
            ? query.is("deleted_at", null).order("id", { ascending: true })
            : query.order("id", { ascending: true });
        return ordered.range(from, to);
      },
      `Não foi possível ler ${table === "subjects" ? "as disciplinas" : "os cursos"}`,
    );
    return rows.map((r) => ({
      id: String(r["id"]),
      school_id: String(r["school_id"]),
      name: String(r["name"] ?? ""),
      catalog_code:
        typeof r[ADOPTION_COLUMN[table]] === "string"
          ? (r[ADOPTION_COLUMN[table]] as string)
          : null,
    }));
  };

  const [schools, subjects, programs] = await Promise.all([
    db.from("schools").select("id, name, commercial_name"),
    load("subjects"),
    load("programs"),
  ]);
  if (schools.error) {
    throw publicDatabaseError(schools.error, "Não foi possível carregar as escolas.");
  }
  return summarizeAdoption({
    linkAvailable,
    schools: (schools.data ?? []).map((s) => ({
      id: s.id,
      name: s.commercial_name || s.name,
    })),
    subjects,
    programs,
  });
}
