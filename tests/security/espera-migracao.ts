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
export const COLUNAS_ESPERA_MIGRACAO = new Set<string>([
  // 20261005150000_fee_items_grade_level.sql (docs/agents/SIGA_aplicar_propina_por_classe.sql).
  // Sondas em finance/server.ts (gradePricingAvailable) e no importador de propinas, com
  // isMissingGradeColumn (finance/fee-items.ts); as outras leituras de fee_items usam select("*").
  "fee_items.grade_level_id",
]);
