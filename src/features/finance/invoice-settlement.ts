/**
 * Estado de uma fatura a partir do que os recibos válidos já pagaram, contra o
 * total a pagar (valor menos desconto mais a multa já aplicada) — a regra de
 * `private.register_payment` desde 20261004135000. Usada no estorno, no webhook,
 * no PayFlow e na importação.
 */
export type SettlementStatus = "open" | "partially_paid" | "paid";

export function invoiceStatusFromPaid(invoiceAmount: number, paid: number): SettlementStatus {
  const cents = (v: number) => Math.round(Number(v || 0) * 100);
  if (cents(paid) <= 0) return "open";
  return cents(paid) >= cents(invoiceAmount) ? "paid" : "partially_paid";
}

/**
 * Total a pagar da fatura: valor menos desconto mais a multa por atraso já aplicada
 * (`penalty_amount`, ver `late-fee.ts`), nunca negativo. Quem lê a fatura para isto
 * tem de pedir `penalty_amount`; sem ela, a multa conta como 0.
 */
export function invoiceNetTotal(invoice: {
  amount: unknown;
  discount_amount?: unknown;
  penalty_amount?: unknown;
}) {
  return Math.max(
    Number(invoice.amount ?? 0) -
      Number(invoice.discount_amount ?? 0) +
      Number(invoice.penalty_amount ?? 0),
    0,
  );
}
