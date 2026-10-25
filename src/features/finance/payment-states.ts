import type { StatusKey } from "@/lib/status-registry";

/**
 * Um só vocabulário para os estados do dinheiro (§4.3 e §9.4 do plano financeiro).
 *
 * Cada domínio guarda o seu estado — a fatura (`issued/partial/paid/void`), a
 * cobrança do gateway (`pending/settling/paid/…`), o recibo (`issued/reversed`) e o
 * plano (`pending_gateway/settled/cancelled`). Não se unificam na base: são coisas
 * diferentes, e o plano pede que se distinga o estado do pagamento do da fatura.
 * Unifica-se a forma de os mostrar: cada um cai numa chave do registo de estados,
 * que traz o ícone e o tom, com um rótulo que diz o que aconteceu ao dinheiro.
 *
 * Regra: nada aparece como «Pago» ou «Confirmado» sem confirmação real — uma
 * cobrança criada, um plano à espera do gateway ou um aviso por conferir são
 * «A aguardar confirmação» ou «Em revisão», nunca dinheiro recebido.
 */
export type PaymentStateView = { status: StatusKey; label: string };

/** Estado da obrigação: quanto da fatura já está coberto por recibos válidos. */
export function invoiceState(
  invoice: { status: string; total: number; paid: number; dueOn: string | null | undefined },
  today: string,
): PaymentStateView {
  if (invoice.status === "void" || invoice.status === "cancelled") {
    return { status: "cancelled", label: "Anulada" };
  }
  if (invoice.status === "paid" || (invoice.total > 0 && invoice.paid >= invoice.total)) {
    return { status: "paid", label: "Paga" };
  }
  const overdue = Boolean(invoice.dueOn && invoice.dueOn < today);
  if (overdue) {
    return {
      status: "overdue",
      label: invoice.paid > 0 ? "Vencida · paga em parte" : "Vencida",
    };
  }
  if (invoice.paid > 0) return { status: "partial", label: "Paga em parte" };
  return { status: "pending", label: "Por pagar" };
}

const GATEWAY: Record<string, PaymentStateView> = {
  pending: { status: "pending", label: "A aguardar confirmação" },
  settling: { status: "processing", label: "Em processamento" },
  paid: { status: "paid", label: "Confirmado e lançado" },
  failed: { status: "failed", label: "Falhado" },
  expired: { status: "cancelled", label: "Expirado" },
  needs_review: { status: "suspended", label: "Em revisão" },
  mismatch: { status: "failed", label: "Não confere com o fornecedor" },
};

/** Estado da transacção no fornecedor (AppyPay / Multicaixa). */
export function gatewayChargeState(status: string): PaymentStateView {
  return GATEWAY[status] ?? { status: "pending", label: "Por conferir" };
}

/** Estado do recibo: a liquidação real, ou o seu estorno. */
export function receiptState(status: string): PaymentStateView {
  return status === "reversed"
    ? { status: "refunded", label: "Estornado" }
    : { status: "paid", label: "Confirmado" };
}

const PLAN: Record<string, PaymentStateView> = {
  pending_gateway: { status: "pending", label: "A aguardar confirmação" },
  settled: { status: "paid", label: "Liquidado" },
  paid: { status: "paid", label: "Liquidado" },
  cancelled: { status: "cancelled", label: "Cancelado" },
};

/** Estado do plano de pagamento com canal (Multicaixa Express, Unitel, …). */
export function paymentPlanState(status: string): PaymentStateView {
  return PLAN[status] ?? { status: "pending", label: "Por conferir" };
}
