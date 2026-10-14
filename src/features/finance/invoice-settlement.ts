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

/**
 * Quanto os recibos válidos (não anulados) já pagaram de cada fatura. Estava
 * copiado em seis sítios (tesouraria, painel, ficha da pessoa, lista de alunos).
 */
export function sumPaidByInvoice(
  receipts:
    ReadonlyArray<{ invoice_id: unknown; amount: unknown; status?: unknown }> | null | undefined,
): Map<string, number> {
  const paid = new Map<string, number>();
  for (const receipt of receipts ?? []) {
    if (receipt.status === "reversed") continue;
    const id = String(receipt.invoice_id);
    paid.set(id, (paid.get(id) ?? 0) + Number(receipt.amount ?? 0));
  }
  return paid;
}
