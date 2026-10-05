import type { BillingSettings } from "@/features/school/settings-domains";
import { schoolTodayIso } from "@/lib/school-date";

/**
 * Multa por atraso: uma regra só, igual à de `private.late_fee_due`
 * (20261004135000_late_fee_one_rule.sql). A tesouraria aplica-a na base; a
 * referência EMIS, o AppyPay, o plano de pagamento e o webhook usam esta.
 *
 * - Aplica-se uma vez: a fatura que já tem multa (`penalty_amount > 0`) não leva outra.
 * - Só a pagamentos depois do vencimento mais a tolerância. Conta a data, não a hora:
 *   quem paga no último dia da tolerância não paga multa.
 * - Valor: a percentagem sobre o valor da fatura, arredondada ao cêntimo.
 * - Âmbito (Definições › Cobrança): `all` em todos os pagamentos; `electronic` só nos
 *   electrónicos (Multicaixa, referência EMIS, Express, Unitel Money, AppyPay), não em
 *   numerário nem transferência.
 */
export type LateFeeChannel = "counter" | "electronic";

type LateFeeRule = Pick<BillingSettings, "late_fee_percent" | "grace_days" | "late_fee_scope">;

/** Canal pelo método do recibo (`finance_receipts.payment_method`), como na base. */
export function lateFeeChannelOfLedgerMethod(method: string): LateFeeChannel {
  return method === "card" || method === "other" ? "electronic" : "counter";
}

/**
 * Centésimas inteiras de um valor, arredondadas a meio para cima pelo decimal escrito
 * (`1.255` → 126), como o `round(x, 2)` do `numeric` do Postgres. `Math.round(x * 100)`
 * daria 125, porque 1.255 em binário é 1.25499…
 */
function hundredths(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const text = value.toString();
  if (/e/i.test(text)) return Math.round(value * 100);
  const [whole = "0", fraction = ""] = text.split(".");
  const digits = `${fraction}000`.slice(0, 3);
  return Number(whole) * 100 + Number(digits.slice(0, 2)) + (Number(digits[2]) >= 5 ? 1 : 0);
}

/** `YYYY-MM-DD` mais `days` dias (UTC, sem horas). */
export function addDaysIso(isoDate: string, days: number): string {
  const date = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Multa a aplicar a um pagamento feito em `paidOn` (`YYYY-MM-DD`) por `channel`.
 * 0 quando a fatura já tem multa, não está atrasada, a escola não cobra multa ou o
 * canal fica fora do âmbito.
 */
export function lateFeeFor(
  invoice: { amount: unknown; due_date?: string | null; penalty_amount?: unknown },
  rule: LateFeeRule,
  paidOn: string,
  channel: LateFeeChannel,
): number {
  if (Number(invoice.penalty_amount ?? 0) > 0) return 0;
  if (!invoice.due_date) return 0;
  // Centésimas de ponto percentual e cêntimos, em inteiros: o mesmo arredondamento que
  // `round(round(amount, 2) * round(pct, 2) / 100, 2)` faz no Postgres.
  const pctHundredths = hundredths(Number(rule.late_fee_percent));
  if (!(pctHundredths > 0)) return 0;
  if (channel === "counter" && rule.late_fee_scope === "electronic") return 0;
  if (paidOn.slice(0, 10) <= addDaysIso(invoice.due_date, rule.grace_days)) return 0;
  const cents = hundredths(Number(invoice.amount));
  if (!(cents > 0)) return 0;
  const product = cents * pctHundredths;
  const feeCents = Math.floor(product / 10_000) + (product % 10_000 >= 5_000 ? 1 : 0);
  return feeCents / 100;
}

/** Data de hoje na escola (`YYYY-MM-DD`, Luanda), a mesma que os pagamentos gravam em `paid_on`. */
export function todayIso() {
  return schoolTodayIso();
}
