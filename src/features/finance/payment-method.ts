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
  if (method === "multicaixa" || method === "multicaixa_express" || method === "express") {
    return "card";
  }
  return "other";
}
