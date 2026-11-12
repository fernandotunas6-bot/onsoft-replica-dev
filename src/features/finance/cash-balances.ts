type Movement = { amount?: unknown; status?: unknown };

/**
 * Numerário na gaveta e dinheiro no banco são saldos diferentes: somá-los dava um
 * «saldo de caixa» que nenhuma contagem física confirmava. Os recibos usam o método
 * do razão (`cash`, `bank_transfer`, `card`, `other`); as despesas, o do formulário
 * (`cash`, `transfer`, `multicaixa`, …). Só `cash` é numerário. Estornados não contam.
 */
export function splitCashBalances(
  receipts: Array<Movement & { payment_method?: unknown }>,
  expenses: Array<Movement & { method?: unknown }>,
) {
  let drawer = 0;
  let bank = 0;
  for (const r of receipts) {
    if (r.status === "reversed") continue;
    if (r.payment_method === "cash") drawer += Number(r.amount ?? 0);
    else bank += Number(r.amount ?? 0);
  }
  for (const e of expenses) {
    if (e.status === "reversed") continue;
    if (e.method === "cash") drawer -= Number(e.amount ?? 0);
    else bank -= Number(e.amount ?? 0);
  }
  return { drawer_balance: drawer, bank_balance: bank };
}
