import { z } from "zod";

import { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { settleGatewayPayment } from "@/features/finance/gateway-webhook-handler";
import { minorUnitsToKz } from "@/features/finance/payflow-education-sync";
import { timingSafeEqual } from "@/lib/timing-safe-equal";

export const payflowSettlementInputSchema = z.object({
  event: z.enum(["payment.paid", "payment.refunded"]),
  school_id: z.string().uuid(),
  invoice_id: z.string().uuid(),
  payment_id: z.string().trim().min(6).max(80),
  amount_minor: z.number().int().positive().max(999_999_999_99),
  currency: z.string().trim().toUpperCase().regex(/^AOA$/),
  receipt_code: z.string().trim().min(4).max(80).nullable().optional(),
  reason: z.string().trim().max(500).nullable().optional(),
});

export type PayflowSettlementInput = z.infer<typeof payflowSettlementInputSchema>;

export function payflowSettlementAuthorized(authorization: string | null) {
  const expected = process.env.PAYFLOW_INTEGRATION_API_KEY?.trim() ?? "";
  if (expected.length < 24) return false;
  const supplied = authorization?.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : (authorization?.trim() ?? "");
  return timingSafeEqual(supplied, expected);
}

export async function applyPayflowSettlement(input: PayflowSettlementInput) {
  const db = await loadSgaAdminClient();
  const amountKz = minorUnitsToKz(input.amount_minor);
  if (amountKz <= 0) {
    return { ok: false as const, status: 400, message: "Valor inválido." };
  }

  const { data: invoice, error } = await db
    .from("finance_invoices")
    .select("id, status, school_id")
    .eq("id", input.invoice_id)
    .eq("school_id", input.school_id)
    .maybeSingle();
  if (error) {
    return { ok: false as const, status: 500, message: "Não foi possível ler a fatura." };
  }
  if (!invoice) {
    return { ok: false as const, status: 404, message: "Fatura não encontrada nesta escola." };
  }

  if (input.event === "payment.paid") {
    const settled = await settleGatewayPayment(db, {
      schoolId: input.school_id,
      invoiceId: input.invoice_id,
      amount: amountKz,
      method: "transfer",
      reference: input.payment_id,
    });
    if (settled.alreadyPaid) {
      return {
        ok: true as const,
        status: 200,
        message: "Fatura já estava liquidada no SIGA.",
        idempotent: true,
      };
    }
    return {
      ok: true as const,
      status: 200,
      message: `Pagamento PayFlow lançado. Recibo ${settled.receiptNumber}.`,
      receiptNumber: settled.receiptNumber,
      idempotent: false,
    };
  }

  const { data: receipts, error: receiptsError } = await db
    .from("finance_receipts")
    .select("id, status")
    .eq("invoice_id", input.invoice_id)
    .eq("school_id", input.school_id);
  if (receiptsError) {
    return { ok: false as const, status: 500, message: "Não foi possível ler os recibos." };
  }

  const active = (receipts ?? []).filter((row) => String(row.status ?? "") !== "reversed");
  if (active.length === 0 && invoice.status !== "paid") {
    return {
      ok: true as const,
      status: 200,
      message: "Estorno já reflectido no SIGA.",
      idempotent: true,
    };
  }

  const reason = input.reason?.trim() || `Estorno PayFlow ${input.payment_id}`;
  const now = new Date().toISOString();
  for (const receipt of active) {
    const { error: reverseError } = await db
      .from("finance_receipts")
      .update({
        status: "reversed",
        reversed_at: now,
        reversal_reason: reason,
      })
      .eq("id", receipt.id)
      .eq("school_id", input.school_id)
      // Filtrar pelo estado na própria condição, e não só pelo `active` calculado
      // acima: duas entregas simultâneas do mesmo estorno passariam ambas pelo
      // filtro em memória e a segunda sobrescreveria `reversed_at`/`reversal_reason`
      // da primeira, apagando o rasto de quando e porquê foi anulado.
      .eq("status", "issued");
    if (reverseError) {
      return {
        ok: false as const,
        status: 500,
        message: "Não foi possível anular o recibo no SIGA.",
      };
    }
  }

  // Todos os recibos activos foram estornados, logo o valor liquidado é zero e a fatura
  // volta a `open` — é o mesmo cálculo que `private.reverse_receipt` faz
  // (`remaining_paid <= 0 then 'open'`). Uma fatura `partially_paid` também tem de ser
  // reaberta: deixá-la como está fazia o aluno aparecer com parte da dívida saldada por
  // um pagamento que já não existe.
  //
  // `"issued"` não é um estado admitido por `finance_invoices_status_check`
  // ('open','partially_paid','paid','cancelled') e `finance_invoices` não tem coluna
  // `updated_at` — a versão anterior falhava sempre, e falhava *depois* de já ter
  // estornado os recibos, deixando a fatura presa em `paid` sem recibos activos.
  // A condição é o estado em que a fatura tem de ficar, não o que esta chamada fez: assim
  // também repõe as faturas que a versão anterior deixou presas em `paid` com todos os
  // recibos já estornados — nesses casos `active` vem vazio e um `active.length > 0`
  // deixaria o estado partido para sempre.
  if (invoice.status !== "cancelled" && invoice.status !== "open") {
    const { error: invoiceError } = await db
      .from("finance_invoices")
      .update({ status: "open" })
      .eq("id", input.invoice_id)
      .eq("school_id", input.school_id)
      .neq("status", "cancelled");
    if (invoiceError) {
      return {
        ok: false as const,
        status: 500,
        message: "Não foi possível reabrir a fatura no SIGA.",
      };
    }
  }

  return {
    ok: true as const,
    status: 200,
    message: "Estorno PayFlow reflectido no caixa SIGA.",
    idempotent: false,
  };
}
