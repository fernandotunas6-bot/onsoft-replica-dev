/**
 * Assinatura da escola, vista pelo Administrador (Configurações → Assinatura).
 *
 * O que as plataformas SaaS mostram na área de facturação: plano e estado,
 * período experimental, uso face aos limites do plano, domínios e os outros
 * planos para comparar. Tudo lido no servidor, a partir da escola da sessão —
 * nunca de um identificador vindo do browser.
 *
 * Mudar de plano não é automático: o pagamento é validado à mão (IBAN e
 * comprovativo). O pedido fica em `saas_audit_logs`, onde a equipa da
 * plataforma o vê no ADMIN.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { loadSgaAdminClient, resolveSgaMembershipAdmin } from "@/integrations/supabase/sga-admin";
import { getPlatformSubdomain } from "@/lib/saas/platform-domain";
import { fetchActivePlans } from "./catalog";
import { planCodeSchema } from "./schemas";
import type { Plan } from "./types";

type Db = Awaited<ReturnType<typeof loadSgaAdminClient>>;

export type SubscriptionOverview = {
  tenantId: string;
  schoolName: string;
  slug: string;
  status: string;
  subscriptionStatus: string | null;
  trialEndsAt: string | null;
  periodEnd: string | null;
  plan: Plan | null;
  usage: {
    students: number;
    staff: number;
    storageBytes: number;
    calculatedAt: string | null;
  };
  limits: { students: number | null; staff: number | null; storageGb: number | null };
  domains: Array<{ hostname: string; type: string; status: string; sslStatus: string | null }>;
  subdomain: string;
  plans: Plan[];
  pendingPlanRequest: { planCode: string; requestedAt: string } | null;
};

async function requireSchoolAdminTenant(userId: string) {
  const membership = await resolveSgaMembershipAdmin(userId);
  if (!membership) throw new Error("Sem escola activa.");
  if (membership.appRole !== "Administrador") {
    throw new Error("Só o Administrador da escola vê e gere a assinatura.");
  }
  const db = await loadSgaAdminClient();
  const { data: school, error } = await db
    .from("schools")
    .select("id, name, tenant_id")
    .eq("id", membership.schoolId)
    .maybeSingle();
  if (error) throw publicDatabaseError(error, "Não foi possível ler a escola.");
  if (!school?.tenant_id) {
    throw new Error("Esta escola ainda não tem assinatura associada. Fale com o suporte.");
  }
  return { db, schoolName: String(school.name ?? ""), tenantId: String(school.tenant_id) };
}

async function latestPlanRequest(db: Db, tenantId: string) {
  const { data } = await db
    .from("saas_audit_logs")
    .select("metadata, created_at, action")
    .eq("tenant_id", tenantId)
    .in("action", ["plan_change_requested", "plan_change_cancelled"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data || data.action !== "plan_change_requested") return null;
  const planCode = (data.metadata as { to?: unknown } | null)?.to;
  return typeof planCode === "string" ? { planCode, requestedAt: String(data.created_at) } : null;
}

export const getMySubscription = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SubscriptionOverview> => {
    const { db, schoolName, tenantId } = await requireSchoolAdminTenant(context.userId);

    const [tenantRes, subscriptionRes, usageRes, domainsRes, plans, pending] = await Promise.all([
      db
        .from("tenants")
        .select(
          "id, name, slug, status, plan_id, subscription_status, trial_ends_at, max_students, max_storage_gb",
        )
        .eq("id", tenantId)
        .maybeSingle(),
      db
        .from("subscriptions")
        .select("plan_id, status, current_period_end")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db
        .from("tenant_usage")
        .select("active_students_count, active_staff_count, storage_bytes_used, last_calculated_at")
        .eq("tenant_id", tenantId)
        .maybeSingle(),
      db
        .from("tenant_domains")
        .select("hostname, type, status, ssl_status")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: true }),
      fetchActivePlans(),
      latestPlanRequest(db, tenantId),
    ]);
    if (tenantRes.error)
      throw publicDatabaseError(tenantRes.error, "Não foi possível ler a assinatura.");
    const tenant = tenantRes.data;
    if (!tenant) throw new Error("Assinatura não encontrada.");

    const planId = subscriptionRes.data?.plan_id ?? tenant.plan_id;
    let plan = plans.find((p) => p.id === planId) ?? null;
    if (!plan && planId) {
      // Plano desactivado do catálogo continua a ser o da escola.
      const { data } = await db.from("plans").select("*").eq("id", planId).maybeSingle();
      plan = (data as unknown as Plan | null) ?? null;
    }

    const usage = usageRes.data;
    return {
      tenantId,
      schoolName: schoolName || String(tenant.name ?? ""),
      slug: String(tenant.slug ?? ""),
      status: String(tenant.status ?? ""),
      subscriptionStatus:
        (subscriptionRes.data?.status as string | undefined) ??
        (tenant.subscription_status as string | null) ??
        null,
      trialEndsAt: (tenant.trial_ends_at as string | null) ?? null,
      periodEnd: (subscriptionRes.data?.current_period_end as string | null) ?? null,
      plan,
      usage: {
        students: Number(usage?.active_students_count ?? 0),
        staff: Number(usage?.active_staff_count ?? 0),
        storageBytes: Number(usage?.storage_bytes_used ?? 0),
        calculatedAt: (usage?.last_calculated_at as string | null) ?? null,
      },
      limits: {
        students: plan?.max_students ?? (tenant.max_students as number | null) ?? null,
        staff: plan?.max_staff ?? null,
        storageGb: plan?.max_storage_gb ?? (tenant.max_storage_gb as number | null) ?? null,
      },
      domains: (domainsRes.data ?? []).map((d) => ({
        hostname: String(d.hostname),
        type: String(d.type ?? ""),
        status: String(d.status ?? ""),
        sslStatus: (d.ssl_status as string | null) ?? null,
      })),
      subdomain: getPlatformSubdomain(String(tenant.slug ?? "")),
      plans,
      pendingPlanRequest: pending,
    };
  });

export const requestPlanChangeInputSchema = z.object({
  planCode: planCodeSchema,
  billing: z.enum(["monthly", "yearly"]).default("monthly"),
  note: z.string().trim().max(500).optional(),
});

export const requestPlanChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => requestPlanChangeInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { db, tenantId, schoolName } = await requireSchoolAdminTenant(context.userId);
    const { data: tenant } = await db
      .from("tenants")
      .select("plan_id")
      .eq("id", tenantId)
      .maybeSingle();
    const plans = await fetchActivePlans();
    const target = plans.find((p) => p.code === data.planCode);
    if (!target) throw new Error("Esse plano não está disponível.");
    if (target.id === tenant?.plan_id) throw new Error("A escola já está nesse plano.");
    const current = plans.find((p) => p.id === tenant?.plan_id);

    const { error } = await db.from("saas_audit_logs").insert({
      tenant_id: tenantId,
      user_id: context.userId,
      action: "plan_change_requested",
      entity: "subscription",
      entity_id: tenantId,
      metadata: {
        school: schoolName,
        from: current?.code ?? null,
        to: target.code,
        billing: data.billing,
        note: data.note ?? null,
      },
    });
    if (error) throw publicDatabaseError(error, "Não foi possível registar o pedido.");
    return { ok: true, planName: target.name };
  });

export const cancelPlanChangeRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db, tenantId } = await requireSchoolAdminTenant(context.userId);
    const { error } = await db.from("saas_audit_logs").insert({
      tenant_id: tenantId,
      user_id: context.userId,
      action: "plan_change_cancelled",
      entity: "subscription",
      entity_id: tenantId,
      metadata: {},
    });
    if (error) throw publicDatabaseError(error, "Não foi possível cancelar o pedido.");
    return { ok: true };
  });
