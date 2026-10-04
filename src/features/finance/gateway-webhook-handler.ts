import type { SupabaseClient } from "@supabase/supabase-js";
import { invoiceStatusFromPaid } from "./invoice-settlement";
import { invoiceAmountDue as amountDueWithPenalty, lateFeeFor, todayInLuanda } from "./late-fee";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { normalizePaymentReference } from "@/features/finance/emiss-multicaixa";
import {
  referencesMatch,
  type GatewayConfirmInput,
} from "@/features/finance/gateway-webhook-schemas";
import { gatewayWebhookPreviousKeyActive } from "@/features/integrations/gateway-webhook-key";
import {
  checkGatewayTimestamp,
  gatewaySignatureMatches,
} from "@/features/finance/gateway-webhook-signature";
import {
  gatewayConfirmInputSchema,
  type GatewayConfirmInput as ParsedGatewayInput,
} from "@/features/finance/gateway-webhook-schemas";
import {
  recordGatewayWebhookEvent,
  type GatewayWebhookEventMeta,
  type GatewayWebhookHandlerResult,
} from "@/features/finance/gateway-webhook-telemetry";
import { isRateLimitBypassed } from "@/lib/rate-limit";
import { consumeRateLimit } from "@/lib/shared-rate-limit";
import { reportSigaError } from "@/lib/ops-report";
import { readSettingsDomain } from "@/features/school/settings-domains";

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

export type ResolvedGatewaySchool = {
  schoolId: string | null;
  provider: (typeof GATEWAY_PROVIDERS)[number];
  devMode: boolean;
};

/**
 * Descobre a escola pela assinatura: a key de cada integração configurada (e a
 * anterior, durante as 24 h de graça da rotação) é testada contra o HMAC.
 */
export async function resolveGatewaySchoolBySignature(
  db: SupabaseClient,
  signed: { timestamp: string; rawBody: string; signature: string | null },
): Promise<ResolvedGatewaySchool | null> {
  const devKey = resolveGatewayDevApiKey();
  if (
    devKey &&
    (await gatewaySignatureMatches(devKey, signed.timestamp, signed.rawBody, signed.signature))
  ) {
    return { schoolId: null, provider: "multicaixa_express", devMode: true };
  }

  const { data: rows, error } = await db
    .from("school_integrations")
    .select("school_id, provider, config, status")
    .in("provider", [...GATEWAY_PROVIDERS])
    .in("status", ["configured", "connected"]);
  if (error) throw publicDatabaseError(error, "Não foi possível validar a assinatura do gateway.");

  for (const row of rows ?? []) {
    const config = (row.config ?? {}) as Record<string, unknown>;
    const keys = [String(config.webhookApiKey ?? "").trim()];
    if (gatewayWebhookPreviousKeyActive(config)) {
      keys.push(String(config.webhookApiKeyPrevious ?? "").trim());
    }
    for (const key of keys) {
      if (
        key &&
        (await gatewaySignatureMatches(key, signed.timestamp, signed.rawBody, signed.signature))
      ) {
        return {
          schoolId: String(row.school_id),
          provider: row.provider as (typeof GATEWAY_PROVIDERS)[number],
          devMode: false,
        };
      }
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
    .select("id, status, amount, discount_amount, penalty_amount, due_date, issued_by")
    .eq("id", input.invoiceId)
    .eq("school_id", input.schoolId)
    .maybeSingle();
  if (invoiceError) throw publicDatabaseError(invoiceError, "Não foi possível ler a fatura.");
  if (!invoice) throw new Error("Fatura não encontrada para esta escola.");
  if (invoice.status === "cancelled") throw new Error("Fatura cancelada.");
  // Multa por atraso: a mesma regra da tesouraria (`late-fee.ts` e
  // private.register_payment, 20261004120000). Um pagamento por referência é sempre
  // electrónico; a multa fica gravada ao primeiro pagamento depois do prazo.
  const billing = await readSettingsDomain(db, input.schoolId, "billing");
  const invoicePenaltyAmount = lateFeeFor(invoice, billing, todayInLuanda(), "electronic");
  if (
    invoice.status !== "paid" &&
    invoicePenaltyAmount > 0 &&
    Number(invoice.penalty_amount ?? 0) === 0
  ) {
    await db
      .from("finance_invoices")
      .update({ penalty_amount: invoicePenaltyAmount })
      .eq("school_id", input.schoolId)
      .eq("id", input.invoiceId)
      .eq("penalty_amount", 0);
  }
  // O saldo em aberto é o valor líquido mais a multa: sem isto uma fatura com
  // desconto nunca chegava a "paid" e uma com multa ficava "paid" antes de tempo.
  const invoiceAmountDue = amountDueWithPenalty(invoice, invoicePenaltyAmount);
  if (invoice.status === "paid") {
    return {
      alreadyPaid: true as const,
      receiptId: null,
      receiptNumber: null,
      planSettled: false,
    };
  }

  // `invoice.status === "paid"` acima só apanha a fatura totalmente liquidada. Numa fatura
  // parcialmente paga, reenviar a mesma confirmação passava e emitia um segundo recibo —
  // e os gateways reenviam por omissão sempre que não recebem o 200 a tempo.
  //
  // O identificador da transação no provedor é a chave natural para isto. Já era recolhido
  // e gravado em `finance_gateway_webhook_events`, mas nunca lido. Aqui é lido: se esta
  // transação já foi liquidada com sucesso, não se liquida outra vez.
  //
  // Isto resolve o reenvio, não a concorrência: o evento só é gravado depois de a
  // liquidação terminar, pelo que duas entregas em paralelo ainda passam as duas. A defesa
  // contra essa corrida é o índice único de `20260924120000_finance_receipt_idempotency.sql`,
  // que tem de ser aplicado à base.
  if (input.externalId) {
    const { data: priorEvent, error: priorError } = await db
      .from("finance_gateway_webhook_events")
      .select("id, invoice_id")
      .eq("school_id", input.schoolId)
      .eq("external_id", input.externalId)
      .eq("ok", true)
      .limit(1)
      .maybeSingle();
    // Uma falha a ler o histórico não pode liquidar à sorte: sem esta resposta não há
    // como saber se a transação já entrou, e repetir um pagamento é pior do que recusá-lo.
    if (priorError && priorError.code !== "42P01") {
      throw publicDatabaseError(
        priorError,
        "Não foi possível verificar se esta transação já tinha sido liquidada.",
      );
    }
    if (priorEvent?.id) {
      return {
        alreadyPaid: true as const,
        receiptId: null,
        receiptNumber: null,
        planSettled: false,
      };
    }
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

      // Caminho atómico (20261002090137, aplicada a 2026-10-02): fatura bloqueada,
      // saldo, recibo e estado numa só transacção. Se a função faltar (base sem a
      // migração, ex.: ambiente local), segue-se o caminho em passos, abaixo.
      if (input.externalId) {
        const receiver = await resolveGatewayReceiver(
          db,
          input.schoolId,
          (invoice as { issued_by?: string | null }).issued_by ?? null,
        );
        const { data: atomic, error: atomicError } = await db.rpc(
          "settle_gateway_payment_service" as never,
          {
            school_id: input.schoolId,
            invoice_id: input.invoiceId,
            amount: input.amount,
            payment_method: mapPaymentMethodForLedger(input.method),
            received_by: receiver,
            external_id: input.externalId,
            paid_on: today,
          } as never,
        );
        if (!atomicError) {
          const settled = atomic as unknown as {
            alreadyPaid: boolean;
            receiptId?: string;
            receiptNumber?: string;
            invoiceStatus?: string;
          };
          if (settled.alreadyPaid) {
            return {
              alreadyPaid: true as const,
              receiptId: null,
              receiptNumber: null,
              planSettled: false,
            };
          }
          result = {
            receiptId: String(settled.receiptId),
            receiptNumber: String(settled.receiptNumber),
            invoiceStatus: String(settled.invoiceStatus),
          };
          return finishGatewaySettlement(db, input, normRef, result);
        }
        if (!isMissingFunction(atomicError)) {
          throw new Error(atomicError.message || "Não foi possível liquidar o pagamento.");
        }
      }

      const { data: receipts, error: receiptsError } = await db
        .from("finance_receipts")
        .select("amount")
        .eq("school_id", input.schoolId)
        .eq("invoice_id", input.invoiceId)
        .eq("status", "issued");
      // Sem esta soma não há como saber quanto falta; falhar a lê-la e liquidar à mesma
      // era assumir que a fatura estava em aberto.
      if (receiptsError) {
        throw publicDatabaseError(
          receiptsError,
          "Não foi possível apurar o valor já liquidado desta fatura.",
        );
      }
      const alreadyPaid = (receipts ?? []).reduce((acc, r) => acc + Number(r.amount || 0), 0);
      // A mesma guarda que `private.register_payment` tem e que este caminho tinha perdido:
      // lá o excesso levanta excepção, aqui `alreadyPaid` só era usado para escolher entre
      // `paid` e `partially_paid`. Sem ela, recibos a mais somavam acima do valor da fatura
      // sem nada o assinalar.
      if (alreadyPaid + input.amount > invoiceAmountDue + 0.009) {
        throw new Error("O valor do pagamento excede o saldo em aberto da fatura.");
      }

      // `finance_receipts.received_by` é NOT NULL e um webhook não tem utilizador. Quem
      // emitiu a fatura é o mais próximo de um responsável verdadeiro.
      //
      // O último recurso anterior era `school_memberships` **sem filtro de escola** — um
      // recibo podia ficar atribuído a um utilizador de outra instituição, o que além de
      // errado atravessa a fronteira entre inquilinos. Um membro da escola, mesmo que
      // arbitrário, é a pior atribuição aceitável; fora da escola não é atribuição nenhuma.
      let receivedBy = (invoice as { issued_by?: string | null }).issued_by ?? null;
      if (!receivedBy) {
        const { data: member } = await db
          .from("school_memberships")
          .select("user_id")
          .eq("school_id", input.schoolId)
          .eq("status", "active")
          .limit(1)
          .maybeSingle();
        receivedBy = member?.user_id ?? null;
      }
      // Nunca alguém de outra escola: sem responsável nesta escola, fica para revisão.
      if (!receivedBy) {
        // A frase "responsável nesta escola" é afirmada por
        // `tests/finance/gateway-settlement.test.ts`. Inserir "activo" no meio dela
        // partiu o teste sem mudar nada de útil -- a segunda frase é que acrescenta,
        // dizendo ao operador o que fazer.
        throw new Error(
          "Não há responsável nesta escola para assinar o recibo do gateway. " +
            "Configure a tesouraria antes de activar o pagamento automático.",
        );
      }

      // A numeração oficial vem de `private.next_document_number`, mas essa exige
      // `auth.uid()`, que num webhook server-to-server é sempre null — a mesma série
      // que a tesouraria usa ("REC-0001") ficava inalcançável daqui, e este caminho
      // tinha o seu próprio contador paralelo (REC-AAAA/NNNN via count(*), nunca via
      // document_sequences). Duas séries do mesmo tipo de documento é um problema de
      // conformidade (há exportação SAF-T AO neste módulo) — ver
      // docs/auditoria/06-auditoria.md, achado P1 da área 6.2.
      //
      // `public.next_document_number_service` (20260924135100) é a mesma sequência
      // sem a exigência de sessão, restrita a service_role por GRANT — o webhook já
      // validou a assinatura HMAC antes de chegar aqui. Atómica (FOR UPDATE dentro da
      // função): não precisa do retry manual por colisão de número.
      let receiptNumber = "";
      let newReceipt: { id: string } | null = null;
      let recError: { code?: string; message: string; details?: string } | null = null;
      // `finance_receipts.external_id` só existe depois de
      // `20260924120000_finance_receipt_idempotency.sql` ser aplicada. Enquanto não for,
      // o insert devolve 42703 e repete-se sem a coluna — a protecção contra reenvio
      // continua a ser a do histórico de eventos, acima.
      let withExternalId = Boolean(input.externalId);
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const { data: generatedNumber, error: numberError } = await db.rpc(
          "next_document_number_service",
          { school_id: input.schoolId, document_type: "receipt", default_prefix: "REC" },
        );
        if (numberError || !generatedNumber) {
          recError = numberError ?? { message: "Não foi possível gerar o número do recibo." };
          break;
        }
        receiptNumber = generatedNumber;
        const result = await db
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
            ...(withExternalId ? { external_id: input.externalId } : {}),
          })
          .select("id")
          .single();
        if (!result.error) {
          newReceipt = result.data;
          recError = null;
          break;
        }
        recError = result.error;
        if (result.error.code === "42703" && withExternalId) {
          withExternalId = false;
          continue;
        }
        if (result.error.code === "23505") {
          // Duas colisões diferentes com o mesmo código. Se foi o índice de idempotência,
          // outra entrega da MESMA transação chegou primeiro e já a liquidou: avançar o
          // número de recibo repetiria o pagamento em vez de o impedir. Se foi o próprio
          // número (corrida rara entre duas chamadas concorrentes à RPC), pedir o
          // próximo e tentar de novo — a função já avançou o contador.
          const conflito = `${result.error.message} ${result.error.details ?? ""}`;
          if (/external_id/i.test(conflito)) {
            return {
              alreadyPaid: true as const,
              receiptId: null,
              receiptNumber: null,
              planSettled: false,
            };
          }
          continue;
        }
        break;
      }
      if (recError || !newReceipt)
        throw publicDatabaseError(
          recError ?? { message: "número de recibo esgotado" },
          "Não foi possível emitir recibo do gateway.",
        );

      // `invoiceStatusFromPaid` arredonda a cêntimos (um pagamento exacto não fica
      // "partially_paid" por vírgula flutuante). A base é `invoiceAmountDue`, não
      // `invoiceNetTotal`: só a primeira soma a multa, e uma fatura com multa nunca
      // chegaria a "paid" pagando o valor devido.
      const newStatus = invoiceStatusFromPaid(invoiceAmountDue, alreadyPaid + input.amount);
      // O recibo já existe: não se lança (repetir emitia outro). Mas uma fatura
      // paga que fica "pendente" leva a cobrar de novo, por isso fica registado.
      const { error: statusError } = await db
        .from("finance_invoices")
        .update({ status: newStatus })
        .eq("school_id", input.schoolId)
        .eq("id", input.invoiceId);
      if (statusError) {
        reportSigaError("finance.gateway.invoice_status_failed", statusError, {
          school_id: input.schoolId,
          invoice_id: input.invoiceId,
          receipt_number: receiptNumber,
          status: newStatus,
        });
      }

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

  return finishGatewaySettlement(db, input, normRef, result);
}

type SettleInput = Parameters<typeof settleGatewayPayment>[1];

/** Plano de pagamento liquidado depois do recibo (comum aos dois caminhos). */
async function finishGatewaySettlement(
  db: SupabaseClient,
  input: SettleInput,
  normRef: string,
  result: { receiptId: string; receiptNumber: string; invoiceStatus: string },
) {
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

function isMissingFunction(error: { code?: string; message?: string }) {
  return (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    /could not find the function|function .* does not exist/i.test(error.message ?? "")
  );
}

/**
 * Quem assina o recibo de um webhook: quem emitiu a fatura, ou um membro activo
 * da mesma escola. Nunca alguém de outra escola.
 */
async function resolveGatewayReceiver(
  db: SupabaseClient,
  schoolId: string,
  issuedBy: string | null,
): Promise<string | null> {
  if (issuedBy) return issuedBy;
  const { data: member } = await db
    .from("school_memberships")
    .select("user_id")
    .eq("school_id", schoolId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  return member?.user_id ?? null;
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
  resolved: ResolvedGatewaySchool,
): Promise<GatewayWebhookHandlerResult> {
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
  // Fora do modo de desenvolvimento só se liquida uma referência que o SIGA
  // emitiu e ainda está pendente. Um `invoiceId` solto no corpo já não chega:
  // era assim que quem tivesse a key marcava como paga qualquer fatura da escola.
  if (!resolved.devMode && !plan) {
    return {
      ok: false,
      status: 404,
      message: "Nenhum plano de pagamento pendente com esta referência.",
    };
  }
  if (
    !resolved.devMode &&
    plan?.invoice_id &&
    input.invoiceId &&
    String(plan.invoice_id) !== input.invoiceId
  ) {
    return {
      ok: false,
      status: 409,
      message: "A fatura indicada não é a do plano desta referência.",
    };
  }
  const invoiceId = resolved.devMode
    ? (input.invoiceId ?? (plan?.invoice_id ? String(plan.invoice_id) : null))
    : plan?.invoice_id
      ? String(plan.invoice_id)
      : null;
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

export type GatewayWebhookRequest = {
  rawBody: string;
  timestamp: string | null;
  signature: string | null;
  /** O endereço `/unitel/confirm` fixa o canal. */
  channel?: GatewayConfirmInput["channel"];
};

type GatewayRunResult =
  | GatewayWebhookHandlerResult
  | { ok: false; status: number; message: string; issues?: Record<string, string[] | undefined> };

/** Webhook EMIS / Unitel — pedido assinado; liquida a fatura do plano da referência. */
export async function runFinanceGatewayWebhook(
  request: GatewayWebhookRequest,
  requestIp = "unknown",
): Promise<GatewayRunResult> {
  const rateLimitKey = `ip:${requestIp}`;
  if (
    !isRateLimitBypassed(rateLimitKey) &&
    !(await consumeRateLimit([rateLimitKey], GATEWAY_WEBHOOK_RATE_LIMIT))
  ) {
    return { ok: false as const, status: 429, message: "Demasiados pedidos. Tente mais tarde." };
  }

  let body: unknown;
  try {
    body = JSON.parse(request.rawBody);
  } catch {
    return { ok: false, status: 400, message: "Corpo JSON inválido." };
  }
  if (body && typeof body === "object" && "apiKey" in body) {
    return {
      ok: false,
      status: 400,
      message:
        "A API key já não viaja no corpo: assine o pedido (X-SIGA-Timestamp e X-SIGA-Signature).",
    };
  }
  const parsed = gatewayConfirmInputSchema.safeParse(
    request.channel && body && typeof body === "object"
      ? { ...body, channel: request.channel }
      : body,
  );
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      message: "Pedido inválido.",
      issues: parsed.error.flatten().fieldErrors,
    };
  }
  const input: ParsedGatewayInput = parsed.data;

  const clock = checkGatewayTimestamp(request.timestamp);
  if (!clock.ok) return { ok: false, status: 401, message: clock.message };

  const { loadSgaAdminClient } = await import("@/integrations/supabase/sga-admin");
  const db = await loadSgaAdminClient();
  const resolved = await resolveGatewaySchoolBySignature(db, {
    timestamp: request.timestamp!,
    rawBody: request.rawBody,
    signature: request.signature,
  });
  if (!resolved) {
    return { ok: false, status: 401, message: "Assinatura de gateway inválida." };
  }

  const meta = buildEventMeta(input);
  const result = await executeFinanceGatewayWebhook(db, input, meta, resolved);
  await recordGatewayWebhookEvent(db, meta, result).catch(() => undefined);
  return result;
}
