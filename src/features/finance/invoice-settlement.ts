/**
 * Estado de uma fatura a partir do que os recibos válidos já pagaram. A mesma
 * regra de `private.register_payment` (que compara com `amount`), para que um
 * estorno devolva a fatura ao estado que teria sem esse recibo.
 */
export type SettlementStatus = "open" | "partially_paid" | "paid";

export function invoiceStatusFromPaid(invoiceAmount: number, paid: number): SettlementStatus {
  const cents = (v: number) => Math.round(Number(v || 0) * 100);
  if (cents(paid) <= 0) return "open";
  return cents(paid) >= cents(invoiceAmount) ? "paid" : "partially_paid";
}
