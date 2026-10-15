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
import { PLAN_REQUEST_ACTIONS, pendingPlanRequestFrom, planPriceKz } from "./subscription-view";
import { getPayflowUrl } from "@/lib/ecosystem-urls";

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
    .in("action", [...PLAN_REQUEST_ACTIONS])
    .order("created_at", { ascending: false })
    .limit(10);
  return pendingPlanRequestFrom(
    (data ?? []).map((row) => ({
      action: String(row.action),
      metadata: row.metadata,
      created_at: String(row.created_at),
    })),
  );
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

// ─── Pagamento do plano ──────────────────────────────────────────────────────

const billingSchema = z.enum(["monthly", "yearly"]);

export type PlanPaymentStart =
  | {
      mode: "payflow";
      planName: string;
      amountKz: number;
      checkoutUrl: string;
      reference: string | null;
      iban: string | null;
      beneficiary: string | null;
      bankName: string | null;
      expiresAt: string | null;
    }
  | { mode: "manual"; planName: string; amountKz: number; reason: string };

/**
 * Cobrança do plano no PayFlow: transferência com referência única da escola e
 * página onde se envia o comprovativo. A referência Multicaixa (EMIS) não é
 * oferecida: o PayFlow recusa-a em produção até haver adaptador homologado.
 * Sem PayFlow configurado, a escola paga ao IBAN da plataforma e envia o
 * comprovativo aqui mesmo (`submitPlanPaymentProof`).
 */
export const startPlanPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ planCode: planCodeSchema, billing: billingSchema.default("monthly") }).parse(input),
  )
  .handler(async ({ data, context }): Promise<PlanPaymentStart> => {
    const { db, tenantId, schoolName } = await requireSchoolAdminTenant(context.userId);
    const plans = await fetchActivePlans();
    const plan = plans.find((p) => p.code === data.planCode);
    if (!plan) throw new Error("Esse plano não está disponível.");
    const amountKz = planPriceKz(plan, data.billing);
    if (!amountKz)
      throw new Error("Este plano não tem preço definido. Fale com a equipa comercial.");

    const apiKey = process.env["PAYFLOW_INTEGRATION_API_KEY"]?.trim() ?? "";
    const url = getPayflowUrl("/api/v1/payments");
    if (apiKey.length < 24 || !url) {
      return {
        mode: "manual",
        planName: plan.name,
        amountKz,
        reason: "Pagamento por transferência para o IBAN da plataforma.",
      };
    }

    const { data: school } = await db
      .from("schools")
      .select("id, email")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const { data: tenant } = await db
      .from("tenants")
      .select("slug")
      .eq("id", tenantId)
      .maybeSingle();
    const month = new Date().toISOString().slice(0, 7);
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          // Mesmo plano e periodicidade no mesmo mês → a mesma cobrança.
          "Idempotency-Key": `siga-sub-${tenantId}-${plan.code}-${data.billing}-${month}`,
        },
        body: JSON.stringify({
          amount: Math.round(amountKz * 100),
          currency: "AOA",
          description: `SIGA Plus — plano ${plan.name} (${data.billing === "yearly" ? "anual" : "mensal"})`,
          customer: { name: schoolName, email: (school?.email as string | null) ?? "" },
          external_reference: `SIGA-SUB-${String(tenant?.slug ?? tenantId).slice(0, 60)}`,
          source_app: "SIGA",
          payment_method: "bank_transfer",
          purpose: "school_subscription",
          school_id: String(school?.id ?? tenantId),
          metadata: { tenant_id: tenantId, plan_code: plan.code, billing: data.billing },
        }),
      });
    } catch {
      return { mode: "manual", planName: plan.name, amountKz, reason: "O PayFlow não respondeu." };
    }
    const body = (await response.json().catch(() => null)) as {
      data?: {
        id?: string;
        checkout_url?: string;
        bank_transfer?: {
          reference?: string;
          iban?: string;
          beneficiary?: string;
          bank_name?: string;
          expires_at?: string;
        } | null;
      };
      error?: { message?: string };
    } | null;
    const payment = body?.data;
    if (!response.ok || !payment?.checkout_url) {
      return {
        mode: "manual",
        planName: plan.name,
        amountKz,
        reason: body?.error?.message || "A cobrança não pôde ser criada no PayFlow.",
      };
    }

    await db.from("saas_audit_logs").insert({
      tenant_id: tenantId,
      user_id: context.userId,
      action: "plan_payment_started",
      entity: "subscription",
      entity_id: tenantId,
      metadata: {
        school: schoolName,
        plan_code: plan.code,
        billing: data.billing,
        amount_kz: amountKz,
        payflow_payment_id: payment.id ?? null,
        transfer_reference: payment.bank_transfer?.reference ?? null,
        checkout_url: payment.checkout_url,
      },
    });

    return {
      mode: "payflow",
      planName: plan.name,
      amountKz,
      checkoutUrl: payment.checkout_url,
      reference: payment.bank_transfer?.reference ?? null,
      iban: payment.bank_transfer?.iban ?? null,
      beneficiary: payment.bank_transfer?.beneficiary ?? null,
      bankName: payment.bank_transfer?.bank_name ?? null,
      expiresAt: payment.bank_transfer?.expires_at ?? null,
    };
  });

const PROOF_EXTENSIONS = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
} as const;

/**
 * Recibo de uma transferência já feita para o IBAN da plataforma. Guardado no
 * bucket privado `billing-proofs` (só o servidor lê) e registado para a equipa
 * validar no ADMIN → Subscrições. Enviar o recibo não activa o plano: a equipa
 * confirma a entrada do dinheiro e activa.
 */
export const submitPlanPaymentProof = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        planCode: planCodeSchema,
        billing: billingSchema.default("monthly"),
        contentType: z.enum(["application/pdf", "image/png", "image/jpeg", "image/webp"], {
          message: "Envie um PDF ou uma imagem (PNG, JPG, WebP).",
        }),
        // 5 MB em base64 (≈ 4/3).
        base64: z.string().min(1).max(7_000_000, "O comprovativo deve ter no máximo 5 MB."),
        transferReference: z.string().trim().max(80).optional(),
        paidOn: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        note: z.string().trim().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { db, tenantId, schoolName } = await requireSchoolAdminTenant(context.userId);
    const plans = await fetchActivePlans();
    const plan = plans.find((p) => p.code === data.planCode);
    if (!plan) throw new Error("Esse plano não está disponível.");
    const buffer = Buffer.from(data.base64, "base64");
    if (buffer.byteLength > 5 * 1024 * 1024)
      throw new Error("O comprovativo deve ter no máximo 5 MB.");

    // O caminho é só do servidor: tenant da sessão + carimbo; nada do nome do ficheiro.
    const path = `${tenantId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${PROOF_EXTENSIONS[data.contentType]}`;
    const { error: uploadError } = await db.storage
      .from("billing-proofs")
      .upload(path, buffer, { contentType: data.contentType, upsert: false });
    if (uploadError)
      throw publicDatabaseError(uploadError, "Não foi possível guardar o comprovativo.");

    const { data: tenant } = await db
      .from("tenants")
      .select("plan_id")
      .eq("id", tenantId)
      .maybeSingle();
    const current = plans.find((p) => p.id === tenant?.plan_id);
    const rows = [
      {
        tenant_id: tenantId,
        user_id: context.userId,
        action: "plan_payment_proof_submitted",
        entity: "subscription",
        entity_id: tenantId,
        metadata: {
          school: schoolName,
          plan_code: plan.code,
          billing: data.billing,
          amount_kz: planPriceKz(plan, data.billing),
          proof_path: path,
          content_type: data.contentType,
          transfer_reference: data.transferReference ?? null,
          paid_on: data.paidOn ?? null,
          note: data.note ?? null,
        },
      },
    ];
    // Pagar outro plano é também pedir a mudança: aparece na fila do ADMIN.
    if (current?.code !== plan.code) {
      rows.push({
        tenant_id: tenantId,
        user_id: context.userId,
        action: "plan_change_requested",
        entity: "subscription",
        entity_id: tenantId,
        metadata: {
          school: schoolName,
          from: current?.code ?? null,
          to: plan.code,
          billing: data.billing,
          note: "Comprovativo de pagamento enviado.",
        } as never,
      });
    }
    const { error } = await db.from("saas_audit_logs").insert(rows);
    if (error) throw publicDatabaseError(error, "Não foi possível registar o comprovativo.");
    return { ok: true };
  });
