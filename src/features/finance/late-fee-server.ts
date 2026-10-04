import type { SupabaseClient } from "@supabase/supabase-js";
import { readSettingsDomain } from "@/features/school/settings-domains";
import { invoiceAmountDue, lateFeeFor, todayInLuanda, type PaymentChannel } from "./late-fee";

/**
 * Total a pagar de uma fatura hoje, com a multa da escola (`late-fee.ts`). Não grava a
 * multa: só o pagamento a fixa na fatura (tesouraria, webhook). Para referências,
 * planos e cobranças, o valor pedido é este — igual ao que o pagamento vai exigir.
 */
export async function invoiceTotalDue(
  db: SupabaseClient,
  schoolId: string,
  invoice: {
    amount: unknown;
    discount_amount?: unknown;
    penalty_amount?: unknown;
    due_date?: string | null;
  },
  channel: PaymentChannel,
  paidOn = todayInLuanda(),
) {
  const billing = await readSettingsDomain(db, schoolId, "billing");
  const penalty = lateFeeFor(invoice, billing, paidOn, channel);
  return { penalty, total: invoiceAmountDue(invoice, penalty) };
}
