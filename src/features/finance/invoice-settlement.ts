/**
 * Estado de uma fatura a partir do que os recibos válidos já pagaram, contra o
 * total a pagar (valor menos desconto) — a regra de `private.register_payment`
 * desde 20260927190000. Usada no estorno, no webhook e na importação.
 */
export type SettlementStatus = "open" | "partially_paid" | "paid";

export function invoiceStatusFromPaid(invoiceAmount: number, paid: number): SettlementStatus {
  const cents = (v: number) => Math.round(Number(v || 0) * 100);
  if (cents(paid) <= 0) return "open";
  return cents(paid) >= cents(invoiceAmount) ? "paid" : "partially_paid";
}

/**
 * Total a pagar da fatura: valor menos desconto (nunca negativo), mais a multa já
 * gravada na fatura (`late-fee.ts`), quando a linha a traz.
 */
export function invoiceNetTotal(invoice: {
  amount: unknown;
  discount_amount?: unknown;
  penalty_amount?: unknown;
}) {
  const net = Math.max(Number(invoice.amount ?? 0) - Number(invoice.discount_amount ?? 0), 0);
  return net + Math.max(Number(invoice.penalty_amount ?? 0), 0);
}
