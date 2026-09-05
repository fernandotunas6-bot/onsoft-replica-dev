export type SigaSettlementEvent = "payment.paid" | "payment.refunded";

export type SigaSettlementPayload = {
  event: SigaSettlementEvent;
  school_id: string;
  invoice_id: string;
  payment_id: string;
  amount_minor: number;
  currency: string;
  receipt_code: string | null;
  reason: string | null;
};

export function buildSigaSettlementPayload(input: {
  event: SigaSettlementEvent;
  schoolId: string | null;
  invoiceId: string | null;
  paymentId: string;
  amountMinor: number;
  currency: string;
  receiptCode?: string | null;
  reason?: string | null;
}): SigaSettlementPayload | null {
  if (!input.schoolId || !input.invoiceId) return null;
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) return null;
  return {
    event: input.event,
    school_id: input.schoolId,
    invoice_id: input.invoiceId,
    payment_id: input.paymentId,
    amount_minor: input.amountMinor,
    currency: input.currency.toUpperCase(),
    receipt_code: input.receiptCode ?? null,
    reason: input.reason ?? null,
  };
}
