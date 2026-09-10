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
      .eq("school_id", input.school_id);
    if (reverseError) {
      return {
        ok: false as const,
        status: 500,
        message: "Não foi possível anular o recibo no SIGA.",
      };
    }
  }

  if (invoice.status === "paid") {
    const { error: invoiceError } = await db
      .from("finance_invoices")
      .update({ status: "issued", updated_at: now })
      .eq("id", input.invoice_id)
      .eq("school_id", input.school_id)
      .eq("status", "paid");
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
