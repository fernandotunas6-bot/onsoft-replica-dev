/**
 * Multa por atraso: uma regra para todos os caminhos de pagamento.
 *
 * Antes, o pagamento por referência (EMIS/Unitel) cobrava `valor − desconto + multa`
 * e a tesouraria (`private.register_payment`) e a referência gerada no ecrã cobravam
 * `valor − desconto`: o mesmo encarregado pagava valores diferentes conforme o canal.
 *
 * Regra (igual em `private.register_payment` desde 20261004120000):
 * - a multa é `late_fee_percent` % do valor da fatura, arredondada ao cêntimo;
 * - aplica-se depois do vencimento + `grace_days` (no dia seguinte ao último de tolerância);
 * - fica gravada na fatura (`penalty_amount`) ao primeiro pagamento depois do prazo e não
 *   é recalculada (não «sobe» a meio de um plano de pagamento);
 * - `late_fee_applies_to` decide em que pagamentos se aplica: `all` (todos, a regra
 *   por omissão) ou `electronic` (só referências e carteiras; o balcão não cobra multa).
 *   Uma multa já gravada faz parte da dívida em qualquer canal.
 */

export type LateFeeScope = "all" | "electronic";
export type PaymentChannel = "counter" | "electronic";

export const LATE_FEE_SCOPES: ReadonlyArray<{ value: LateFeeScope; label: string }> = [
  { value: "all", label: "Em todos os pagamentos" },
  { value: "electronic", label: "Só nos pagamentos electrónicos (referência, carteira)" },
];

export function parseLateFeeScope(value: unknown): LateFeeScope {
  return value === "electronic" ? "electronic" : "all";
}

type InvoiceForFee = {
  amount: unknown;
  discount_amount?: unknown;
  penalty_amount?: unknown;
  due_date?: string | null;
};

type BillingForFee = {
  late_fee_percent: number;
  grace_days: number;
  late_fee_applies_to: LateFeeScope;
};

const cents = (value: number) => Math.round(value * 100) / 100;

/** Data (AAAA-MM-DD) a partir da qual a multa se aplica, ou null sem vencimento. */
export function lateFeeStartsOn(dueDate: string | null | undefined, graceDays: number) {
  if (!dueDate || !/^\d{4}-\d{2}-\d{2}/.test(dueDate)) return null;
  const start = new Date(`${dueDate.slice(0, 10)}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() + Math.max(0, Math.trunc(graceDays)) + 1);
  return start.toISOString().slice(0, 10);
}

/**
 * Multa da fatura num pagamento feito em `paidOn` (AAAA-MM-DD) pelo canal indicado.
 * Devolve a multa já gravada, se houver; senão a que este pagamento aplica (ou 0).
 */
export function lateFeeFor(
  invoice: InvoiceForFee,
  billing: BillingForFee,
  paidOn: string,
  channel: PaymentChannel,
): number {
  const stored = Number(invoice.penalty_amount ?? 0);
  if (stored > 0) return cents(stored);
  if (!(billing.late_fee_percent > 0)) return 0;
  if (billing.late_fee_applies_to === "electronic" && channel === "counter") return 0;
  const startsOn = lateFeeStartsOn(invoice.due_date, billing.grace_days);
  if (!startsOn || paidOn.slice(0, 10) < startsOn) return 0;
  return cents((Number(invoice.amount ?? 0) * billing.late_fee_percent) / 100);
}

/** Total a pagar: valor − desconto (nunca negativo) + multa. */
export function invoiceAmountDue(invoice: InvoiceForFee, penalty: number) {
  const net = Math.max(Number(invoice.amount ?? 0) - Number(invoice.discount_amount ?? 0), 0);
  return cents(net + Math.max(penalty, 0));
}

/** Data de hoje em Angola (UTC+1), no formato da coluna `paid_on`. */
export function todayInLuanda(now = new Date()) {
  return new Date(now.getTime() + 60 * 60 * 1000).toISOString().slice(0, 10);
}
