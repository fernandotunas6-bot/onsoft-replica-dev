import type { SupabaseClient } from "@supabase/supabase-js";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { normalizePaymentReference } from "@/features/finance/emiss-multicaixa";
import {
  referencesMatch,
  type GatewayConfirmInput,
} from "@/features/finance/gateway-webhook-schemas";
import { gatewayWebhookApiKeyMatches } from "@/features/integrations/gateway-webhook-key";
import {
  recordGatewayWebhookEvent,
  type GatewayWebhookEventMeta,
  type GatewayWebhookHandlerResult,
} from "@/features/finance/gateway-webhook-telemetry";
import { timingSafeEqual } from "@/lib/timing-safe-equal";
import { checkRateLimit, isRateLimitBypassed, recordRateLimitAttempt } from "@/lib/rate-limit";
import { reportSigaError } from "@/lib/ops-report";

function mapPaymentMethodForLedger(method: string): "cash" | "bank_transfer" | "card" | "other" {
  if (method === "cash") return "cash";
  if (method === "transfer") return "bank_transfer";
  if (method === "multicaixa" || method === "multicaixa_express" || method === "express") {
    return "card";
  }
  return "other";
}

const GATEWAY_PROVIDERS = ["multicaixa_express", "unitel_money"] as const;

/**
 * Modo dev do gateway (e2e/CI, sem integração real configurada na escola).
 * SEGURANÇA: nunca ter aqui um valor por omissão — um literal embutido no
 * código é um segredo público a partir do momento em que o repositório é
 * lido, e um guard baseado só em `NODE_ENV !== "production"` não é fiável
 * (a variável pode não estar definida no runtime do Worker). O modo dev só
 * activa quando `SIGA_GATEWAY_DEV_API_KEY` é definida explicitamente pelo
 * operador (CI define-a em `scripts/siga/prepare-ci-env.mjs`) — nunca em
 * produção, mesmo que a variável exista por engano.
 */
function resolveGatewayDevApiKey(): string | null {
  const key = process.env.SIGA_GATEWAY_DEV_API_KEY?.trim();
  if (!key || key.length < 16) return null;
  if (process.env.NODE_ENV === "production") return null;
  return key;
}

export async function resolveGatewaySchoolByApiKey(db: SupabaseClient, apiKey: string) {
  const devKey = resolveGatewayDevApiKey();
  if (devKey && timingSafeEqual(devKey, apiKey)) {
    return {
      schoolId: null as string | null,
      provider: "multicaixa_express" as const,
      devMode: true,
    };
  }

  const { data: rows, error } = await db
    .from("school_integrations")
    .select("school_id, provider, config, status")
    .in("provider", [...GATEWAY_PROVIDERS])
    .in("status", ["configured", "connected"]);
  if (error) throw publicDatabaseError(error, "Não foi possível validar a API key do gateway.");

  for (const row of rows ?? []) {
    const config = (row.config ?? {}) as Record<string, unknown>;
    if (gatewayWebhookApiKeyMatches(config, apiKey)) {
      return {
        schoolId: String(row.school_id),
        provider: row.provider as (typeof GATEWAY_PROVIDERS)[number],
        devMode: false,
      };
    }
  }
  return null;
}

async function loadPaymentPlan(db: SupabaseClient, schoolId: string, input: GatewayConfirmInput) {
  if (input.planId) {
    const { data, error } = await db
      .from("finance_payment_plans")
      .select("id, school_id, invoice_id, reference, status, channel")
      .eq("id", input.planId)
      .eq("school_id", schoolId)
      .maybeSingle();
    if (error) throw publicDatabaseError(error, "Não foi possível ler o plano de pagamento.");
    return data;
  }

  const { data: plans, error } = await db
    .from("finance_payment_plans")
    .select("id, school_id, invoice_id, reference, status, channel")
    .eq("school_id", schoolId)
    .in("status", ["pending_gateway", "scheduled"])
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw publicDatabaseError(error, "Não foi possível procurar planos de pagamento.");

  const match = (plans ?? []).find((plan) => referencesMatch(plan.reference, input.reference));
  return match ?? null;
}

export async function settleGatewayPayment(
  db: SupabaseClient,
  input: {
    schoolId: string;
    invoiceId: string;
    amount: number;
    method: string;
    reference: string;
    planId?: string | null;
    externalId?: string | null;
  },
) {
  const normRef = normalizePaymentReference(input.reference);
  const { data: invoice, error: invoiceError } = await db
    .from("finance_invoices")
    .select("id, status, amount, discount_amount, issued_by")
    .eq("id", input.invoiceId)
    .eq("school_id", input.schoolId)
    .maybeSingle();
  if (invoiceError) throw publicDatabaseError(invoiceError, "Não foi possível ler a fatura.");
  if (!invoice) throw new Error("Fatura não encontrada para esta escola.");
  if (invoice.status === "cancelled") throw new Error("Fatura cancelada.");
  if (invoice.status === "paid") {
    return {
      alreadyPaid: true as const,
      receiptId: null,
      receiptNumber: null,
      planSettled: false,
    };
  }

  let result: {
    receiptId: string;
    receiptNumber: string;
    invoiceStatus: string;
  };

  const { data: outcome, error } = await db.rpc("register_payment", {
    school_id: input.schoolId,
    invoice_id: input.invoiceId,
    amount: input.amount,
    payment_method: mapPaymentMethodForLedger(input.method),
    paid_on: new Date().toISOString().slice(0, 10),
  });

  if (error) {
    if (/aal2|42501|autorização|permission/i.test(error.message ?? "")) {
      // Chamada de webhook server-to-server (sem sessão AAL2 interactiva).
      // Liquidação direta com o client de serviço da escola.
      const today = new Date().toISOString().slice(0, 10);
      const { data: receipts } = await db
        .from("finance_receipts")
        .select("amount")
        .eq("school_id", input.schoolId)
        .eq("invoice_id", input.invoiceId)
        .eq("status", "issued");
      const alreadyPaid = (receipts ?? []).reduce((acc, r) => acc + Number(r.amount || 0), 0);

      let receivedBy = (invoice as { issued_by?: string | null }).issued_by ?? null;
      if (!receivedBy) {
        const { data: member } = await db
          .from("school_memberships")
          .select("user_id")
          .eq("school_id", input.schoolId)
          .limit(1)
          .maybeSingle();
        receivedBy = member?.user_id ?? null;
      }
      if (!receivedBy) {
        const { data: anyMember } = await db
          .from("school_memberships")
          .select("user_id")
          .limit(1)
          .maybeSingle();
        receivedBy = anyMember?.user_id ?? null;
      }

      let receiptNumber = `REC-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
      const { data: docNum } = await db.rpc("next_document_number", {
        school_id: input.schoolId,
        doc_type: "receipt",
      });
      if (docNum) receiptNumber = String(docNum);

      const { data: newReceipt, error: recError } = await db
        .from("finance_receipts")
        .insert({
          school_id: input.schoolId,
          invoice_id: input.invoiceId,
          receipt_number: receiptNumber,
          amount: input.amount,
          paid_on: today,
          payment_method: mapPaymentMethodForLedger(input.method),
          status: "issued",
          received_by: receivedBy,
        })
        .select("id")
        .single();
      if (recError)
        throw publicDatabaseError(recError, "Não foi possível emitir recibo do gateway.");

      const newStatus =
        alreadyPaid + input.amount >= Number(invoice.amount) ? "paid" : "partially_paid";
      await db
        .from("finance_invoices")
        .update({ status: newStatus })
        .eq("school_id", input.schoolId)
        .eq("id", input.invoiceId);

      result = {
        receiptId: newReceipt.id,
        receiptNumber,
        invoiceStatus: newStatus,
      };
    } else {
      throw publicDatabaseError(error, "Não foi possível registar o pagamento do gateway.");
    }
  } else {
    result = outcome as {
      receiptId: string;
      receiptNumber: string;
      invoiceStatus: string;
    };
  }

  let planSettled = false;
  const planFilters = db
    .from("finance_payment_plans")
    .update({
      status: "settled",
      updated_at: new Date().toISOString(),
    })
    .eq("school_id", input.schoolId)
    .in("status", ["pending_gateway", "scheduled"]);

  if (input.planId) {
    const { data: updated, error: planError } = await planFilters
      .eq("id", input.planId)
      .select("id");
    if (planError) throw publicDatabaseError(planError, "Não foi possível actualizar o plano.");
    planSettled = (updated ?? []).length > 0;
  } else {
    const { data: updatedByInvoice, error: invoicePlanError } = await planFilters
      .eq("invoice_id", input.invoiceId)
      .select("id, reference");
    if (invoicePlanError) {
      throw publicDatabaseError(invoicePlanError, "Não foi possível actualizar o plano.");
    }
    planSettled = (updatedByInvoice ?? []).some((plan) => referencesMatch(plan.reference, normRef));
    if (!planSettled) {
      const { data: updatedByRef, error: refPlanError } = await db
        .from("finance_payment_plans")
        .update({ status: "settled", updated_at: new Date().toISOString() })
        .eq("school_id", input.schoolId)
        .eq("reference", normRef)
        .in("status", ["pending_gateway", "scheduled"])
        .select("id");
      if (refPlanError)
        throw publicDatabaseError(refPlanError, "Não foi possível actualizar o plano.");
      planSettled = (updatedByRef ?? []).length > 0;
    }
  }

  return {
    alreadyPaid: false as const,
    receiptId: result.receiptId,
    receiptNumber: result.receiptNumber,
    invoiceStatus: result.invoiceStatus,
    planSettled,
  };
}

function buildEventMeta(input: GatewayConfirmInput): GatewayWebhookEventMeta {
  return {
    channel: input.channel,
    reference: normalizePaymentReference(input.reference),
    amount: input.amount,
    invoiceId: input.invoiceId ?? null,
    externalId: input.externalId ?? null,
    schoolId: null,
    provider: null,
    devMode: false,
  };
}

async function executeFinanceGatewayWebhook(
  db: SupabaseClient,
  input: GatewayConfirmInput,
  meta: GatewayWebhookEventMeta,
): Promise<GatewayWebhookHandlerResult> {
  const resolved = await resolveGatewaySchoolByApiKey(db, input.apiKey);
  if (!resolved) {
    return { ok: false, status: 401, message: "API key de gateway inválida." };
  }

  meta.devMode = resolved.devMode;
  meta.provider = resolved.provider;

  let schoolId = resolved.schoolId;
  if (resolved.devMode) {
    if (!input.invoiceId) {
      return {
        ok: false,
        status: 400,
        message: "Modo dev: indique invoiceId no corpo do webhook.",
      };
    }
    const { data: invoice } = await db
      .from("finance_invoices")
      .select("school_id")
      .eq("id", input.invoiceId)
      .maybeSingle();
    if (!invoice?.school_id) {
      return { ok: false, status: 404, message: "Fatura não encontrada." };
    }
    schoolId = String(invoice.school_id);
  }

  if (!schoolId) {
    return { ok: false, status: 401, message: "Escola não identificada." };
  }

  meta.schoolId = schoolId;

  const plan = await loadPaymentPlan(db, schoolId, input);
  const invoiceId = input.invoiceId ?? (plan?.invoice_id ? String(plan.invoice_id) : null);
  if (!invoiceId) {
    return {
      ok: false,
      status: 404,
      message: "Plano ou fatura não encontrados para esta referência.",
    };
  }

  meta.invoiceId = invoiceId;

  if (plan && plan.reference && !referencesMatch(plan.reference, input.reference)) {
    return {
      ok: false,
      status: 409,
      message: "Referência não coincide com o plano de pagamento.",
    };
  }

  try {
    const settled = await settleGatewayPayment(db, {
      schoolId,
      invoiceId,
      amount: input.amount,
      method: input.channel,
      reference: input.reference,
      planId: plan?.id ?? input.planId ?? null,
      externalId: input.externalId ?? null,
    });

    if (settled.alreadyPaid) {
      return {
        ok: true,
        status: 200,
        message: "Fatura já estava liquidada.",
        receiptNumber: null,
        planSettled: false,
      };
    }

    return {
      ok: true,
      status: 200,
      message: `Pagamento registado. Recibo ${settled.receiptNumber}.`,
      receiptNumber: settled.receiptNumber,
      planSettled: settled.planSettled,
    };
  } catch (error) {
    // Uma liquidação falhada é dinheiro que o provedor recebeu e o SIGA não
    // registou. Sem isto, o erro morria aqui: a resposta 502 ia para o
    // gateway e mais ninguém ficava a saber.
    reportSigaError("finance.settlement.failed", error, {
      module: "finance",
      action: "gateway.settle",
      school_id: schoolId,
      invoice_id: invoiceId,
      source: meta.provider ?? null,
      amount_cents: Math.round(input.amount * 100),
      reference: input.reference ?? null,
    });
    const message = error instanceof Error ? error.message : "Erro ao liquidar pagamento.";
    return { ok: false, status: 502, message };
  }
}

// Sem limite aqui, um IP conseguia martelar `resolveGatewaySchoolByApiKey`
// (que compara contra as keys de TODAS as integrações configuradas) para
// tentar adivinhar uma API key por força bruta. Generoso o suficiente para
// um gateway real com retries, apertado o suficiente para travar automação.
const GATEWAY_WEBHOOK_RATE_LIMIT = { windowMs: 5 * 60 * 1000, max: 30 };

/** Webhook EMIS / simulador — liquida fatura + plano quando a referência coincide. */
export async function runFinanceGatewayWebhook(input: GatewayConfirmInput, requestIp = "unknown") {
  const rateLimitKey = `ip:${requestIp}`;
  if (
    !isRateLimitBypassed(rateLimitKey) &&
    !checkRateLimit([rateLimitKey], GATEWAY_WEBHOOK_RATE_LIMIT)
  ) {
    return { ok: false as const, status: 429, message: "Demasiados pedidos. Tente mais tarde." };
  }
  recordRateLimitAttempt([rateLimitKey], GATEWAY_WEBHOOK_RATE_LIMIT);

  const { loadSgaAdminClient } = await import("@/integrations/supabase/sga-admin");
  const db = await loadSgaAdminClient();
  const meta = buildEventMeta(input);

  const result = await executeFinanceGatewayWebhook(db, input, meta);

  await recordGatewayWebhookEvent(db, meta, result).catch(() => undefined);

  return result;
}
