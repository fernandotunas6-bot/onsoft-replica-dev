/**
 * Relatório de fecho de caixa (§4.6 do plano financeiro): o que entrou e saiu da gaveta
 * em cada sessão, a partir dos movimentos que os gatilhos da 20261024110000 ligaram a ela.
 *
 * Entradas: recibos em numerário da sessão e despesas estornadas nela (o dinheiro volta).
 * Saídas: despesas em numerário da sessão e recibos estornados nela (o dinheiro sai).
 * Depósitos: numerário levado ao banco (contam à parte das saídas).
 * `fundo + entradas − saídas − depósitos` é o esperado que a base gravou no fecho; quando não bate,
 * um movimento foi reescrito depois do fecho e `consistent` fica falso.
 */

export type ClosedSessionRow = {
  id: string;
  opened_at: string;
  closed_at: string;
  opening_float: number | string | null;
  expected_cash: number | string | null;
  counted_cash: number | string | null;
  difference: number | string | null;
  difference_reason: string | null;
  approved_at: string | null;
};

/** Um movimento da gaveta: o valor e a sessão a que o gatilho o ligou. */
export type SessionMovement = { session_id: string; amount: number | string | null };

export type CashSessionReport = {
  id: string;
  openedAt: string;
  closedAt: string;
  openingFloat: number;
  cashIn: number;
  cashOut: number;
  deposits: number;
  expectedCash: number;
  countedCash: number;
  difference: number;
  reason: string | null;
  /** Diferença zero não precisa de aprovação. */
  state: "balanced" | "pending" | "approved";
  consistent: boolean;
};

const cents = (value: number) => Math.round(value * 100) / 100;

function totalsBySession(rows: SessionMovement[]) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    totals.set(row.session_id, (totals.get(row.session_id) ?? 0) + Number(row.amount ?? 0));
  }
  return totals;
}

export function summarizeCashSessions(
  sessions: ClosedSessionRow[],
  movements: {
    receipts: SessionMovement[];
    reversedReceipts: SessionMovement[];
    expenses: SessionMovement[];
    reversedExpenses: SessionMovement[];
    /** Depósitos no banco não anulados. */
    deposits?: SessionMovement[];
  },
): CashSessionReport[] {
  const receipts = totalsBySession(movements.receipts);
  const reversedReceipts = totalsBySession(movements.reversedReceipts);
  const expenses = totalsBySession(movements.expenses);
  const reversedExpenses = totalsBySession(movements.reversedExpenses);
  const deposited = totalsBySession(movements.deposits ?? []);

  return sessions.map((session) => {
    const openingFloat = Number(session.opening_float ?? 0);
    const cashIn = cents((receipts.get(session.id) ?? 0) + (reversedExpenses.get(session.id) ?? 0));
    const cashOut = cents(
      (expenses.get(session.id) ?? 0) + (reversedReceipts.get(session.id) ?? 0),
    );
    const deposits = cents(deposited.get(session.id) ?? 0);
    const expectedCash = Number(session.expected_cash ?? 0);
    const difference = Number(session.difference ?? 0);
    return {
      id: session.id,
      openedAt: session.opened_at,
      closedAt: session.closed_at,
      openingFloat,
      cashIn,
      cashOut,
      deposits,
      expectedCash,
      countedCash: Number(session.counted_cash ?? 0),
      difference,
      reason: session.difference_reason,
      state: difference === 0 ? "balanced" : session.approved_at ? "approved" : "pending",
      consistent: cents(openingFloat + cashIn - cashOut - deposits) === cents(expectedCash),
    };
  });
}
