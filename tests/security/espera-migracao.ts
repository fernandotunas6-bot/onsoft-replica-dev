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
// O retrato de 2026-10-25 já tem `siga_merge_people` e as funções das sessões de caixa
// (20261024110000, actualizada pela 20261025110000).
export const FUNCOES_ESPERA_MIGRACAO = new Set<string>([]);
