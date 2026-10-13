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
  // Vazia, e é isso que se pretende. `subjects.catalog_subject_code` e
  // `programs.catalog_course_code` saíram a 2026-10-12: a `20261012120000_subjects_catalog_link`
  // foi aplicada na produção e registada no histórico, e o retrato recapturado já traz
  // as duas colunas, os dois CHECK de formato e os dois índices parciais.
  //
  // A espera durou menos de um dia, mas não foi inofensiva: o código que as escreve foi
  // publicado às 17:33 (PR #127) antes de a migração existir na base, pelo que a adopção
  // do catálogo esteve inerte em produção — a leitura degradava com `select("*")`, a
  // escrita respondia «falta aplicar a migração». Publicar o código antes da coluna é o
  // que esta lista deve tornar visível, não normal.
]);

/**
 * Funções `public` que o código chama e a produção ainda não tem (migração escrita e por
 * aplicar). Mesma regra das colunas: só vale se o chamador tratar o PGRST202 com uma
 * mensagem que diga o que falta, em vez de falhar calado. `colunas-inexistentes.test.ts`
 * obriga a tirar a entrada quando o retrato mostrar a função.
 */
export const FUNCOES_ESPERA_MIGRACAO = new Set<string>([
  // Vazia. `merge_school_subjects` saiu a 2026-10-12: a `20261010150000` estava aplicada
  // na produção desde 10/10 e o retrato recapturado traz a função em `public`.
]);
