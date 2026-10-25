export type ClassSubjectLink = { class_group_id: string; subject_id: string };

export const NO_CLASS_SUBJECTS: ClassSubjectLink[] = [];

/**
 * Disciplinas atribuídas à turma (`class_subjects` activos). Sem nenhuma, a lista
 * fica vazia: o servidor recusa notas, avaliações e planos numa disciplina que não
 * seja da turma, por isso oferecer o catálogo da escola só levava a um erro.
 */
export function subjectsOfClass<T extends { id: string }>(
  subjects: T[],
  classSubjects: ClassSubjectLink[],
  classGroupId: string,
): T[] {
  const ids = new Set(
    classSubjects.filter((row) => row.class_group_id === classGroupId).map((row) => row.subject_id),
  );
  return subjects.filter((subject) => ids.has(subject.id));
}
