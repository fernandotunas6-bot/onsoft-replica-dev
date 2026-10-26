/**
 * As secções da ficha da turma; na página `/pedagogica/turmas/<id>`, `?secao=`.
 * Ficam fora do componente da ficha para a configuração da rota (que valida a
 * pesquisa) não arrastar o componente para o código partilhado de todas as páginas.
 */
export const TURMA_SECTIONS = ["resumo", "alunos", "disciplinas", "horario", "avaliacoes"] as const;
export type TurmaSection = (typeof TURMA_SECTIONS)[number];
export function isTurmaSection(value: unknown): value is TurmaSection {
  return typeof value === "string" && (TURMA_SECTIONS as readonly string[]).includes(value);
}
