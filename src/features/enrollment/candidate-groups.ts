/**
 * Turmas para colocar um candidato: as do curso que escolheu no formulário
 * (Ensino Superior) vêm primeiro, a começar pelo 1.º ano; as restantes ficam
 * a seguir, para a secretaria poder decidir outra coisa.
 */
export type CandidateGroup = { id: string; name?: string | null; grade_level_id?: string | null };
export type CandidateGrade = { id: string; program_id?: string | null; sequence?: number | null };

export function orderGroupsForCandidate<G extends CandidateGroup>(
  groups: G[],
  grades: CandidateGrade[],
  desiredProgramId: string | null | undefined,
): { ordered: G[]; preferredCount: number } {
  if (!desiredProgramId) return { ordered: groups, preferredCount: 0 };
  const gradeById = new Map(grades.map((grade) => [grade.id, grade]));
  const sequenceOf = (group: G) =>
    Number(gradeById.get(group.grade_level_id ?? "")?.sequence ?? 99);
  const preferred = groups
    .filter((group) => gradeById.get(group.grade_level_id ?? "")?.program_id === desiredProgramId)
    .sort((a, b) => sequenceOf(a) - sequenceOf(b));
  const rest = groups.filter((group) => !preferred.includes(group));
  return { ordered: [...preferred, ...rest], preferredCount: preferred.length };
}
