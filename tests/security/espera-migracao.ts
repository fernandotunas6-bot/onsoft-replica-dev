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
  // 20261012120000_subjects_catalog_link.sql. A revisão lê `subjects` com `*` e sabe
  // se a coluna existe; `linkSubjectsToCatalog` (education-catalog/subject-review-server.ts)
  // responde «falta aplicar a migração …» ao 42703/PGRST204. Antes desta, a lista
  // esteve vazia de 2026-10-06 a 2026-10-12 — uma lista que ninguém esvazia deixa de
  // ser espera e passa a ser dívida silenciosa.
  "subjects.catalog_subject_code",
  // A mesma migração: education-catalog/catalog-link.ts liga os cursos novos e ignora a falta.
  "programs.catalog_course_code",
]);

/**
 * Funções `public` que o código chama e a produção ainda não tem (migração escrita e por
 * aplicar). Mesma regra das colunas: só vale se o chamador tratar o PGRST202 com uma
 * mensagem que diga o que falta, em vez de falhar calado. `colunas-inexistentes.test.ts`
 * obriga a tirar a entrada quando o retrato mostrar a função.
 */
export const FUNCOES_ESPERA_MIGRACAO = new Set<string>([
  // 20261010150000_merge_school_subjects.sql. education-catalog/subject-review-server.ts
  // responde «falta aplicar a migração …» ao PGRST202/42883.
  "merge_school_subjects",
]);
