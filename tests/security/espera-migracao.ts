/**
 * Colunas que o código usa e a produção ainda não tem, porque há uma migração escrita e
 * por aplicar (pacote para o SQL Editor). Aplicar SQL à base é decisão do dono do
 * projecto, não do agente: esta lista é o registo explícito dessa espera.
 *
 * Uma entrada só vale se o código funcionar sem a coluna até lá: lê com `select("*")` e
 * escolhe em código, e a única consulta que a nomeia é uma sonda que trata o erro.
 *
 * Usada por `colunas-inexistentes.test.ts` e `production-columns.test.ts`. O primeiro
 * obriga a lista a encolher: a coluna sai daqui quando o retrato recapturado já a tiver.
 */
// O retrato de 2026-10-12 já inclui as ligações de cursos/disciplinas ao catálogo.
export const COLUNAS_ESPERA_MIGRACAO = new Set<string>([]);

/**
 * Funções `public` que o código chama e a produção ainda não tem (migração escrita e por
 * aplicar). Mesma regra das colunas: só vale se o chamador tratar o PGRST202 com uma
 * mensagem que diga o que falta, em vez de falhar calado. `colunas-inexistentes.test.ts`
 * obriga a tirar a entrada quando o retrato mostrar a função.
 */
// O retrato de 2026-10-21 inclui também a sonda service-only do website/blog, e já tem
// `merge_school_subjects`.
export const FUNCOES_ESPERA_MIGRACAO = new Set<string>([
  // 20261010110000 (auditoria 14, P4): fundir pessoas numa transacção. Sem ela,
  // mergePeople segue os passos soltos de antes (mergePeopleInSteps, por isMissingFunction).
  "siga_merge_people",
]);

/**
 * Valores de estado que o código escreve ou filtra e o CHECK da produção ainda não
 * aceita (migração escrita e por aplicar). Só vale se o código funcionar sem o valor:
 * a escrita cai para um valor aceite quando a base o recusa (23514).
 * `production-columns.test.ts` usa-a no teste dos valores literais.
 */
// 2026-10-25: aprovação de despesas, `20261025100000_cash_expenses_audit_and_approval.sql`.
// `recordCashExpense` volta a `posted` se a base recusar `pending_approval`.
export const VALORES_ESPERA_MIGRACAO = new Set<string>([
  "siga_cash_expenses.status=pending_approval",
]);
