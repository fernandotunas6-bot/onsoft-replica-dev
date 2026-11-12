/**
 * Método de pagamento do ecrã/gateway → método do livro de recibos
 * (`finance_receipts.payment_method`: cash | bank_transfer | card | other).
 * Decide também se a multa por atraso «só nos electrónicos» se aplica
 * (`lateFeeChannel`). Havia uma cópia na tesouraria e outra no webhook do
 * gateway: uma mudança numa só faria o mesmo pagamento valer diferente.
 */
export function mapPaymentMethodForLedger(
  method: string,
): "cash" | "bank_transfer" | "card" | "other" {
  if (method === "cash") return "cash";
  if (method === "transfer") return "bank_transfer";
  // TPA: o funcionário passa o cartão no terminal do banco e regista o valor pago.
  if (
    method === "tpa" ||
    method === "multicaixa" ||
    method === "multicaixa_express" ||
    method === "express"
  ) {
    return "card";
  }
  return "other";
}

const METHOD_LABELS: Record<string, string> = {
  cash: "Numerário",
  transfer: "Transferência",
  bank_transfer: "Transferência",
  tpa: "TPA (cartão)",
  multicaixa: "Multicaixa",
  multicaixa_express: "Multicaixa Express",
  express: "Multicaixa Express",
  unitel_money: "Unitel Money",
  // No livro de recibos, TPA e Multicaixa ficam ambos como `card`.
  card: "Cartão (TPA / Multicaixa)",
  other: "Outro",
};

/** Nome do método para o ecrã, em vez do código gravado (`cash`, `card`…). */
export function paymentMethodLabel(method: string | null | undefined) {
  const key = String(method ?? "").trim();
  return METHOD_LABELS[key] ?? key;
}
