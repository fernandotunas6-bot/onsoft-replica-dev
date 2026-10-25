export type ClassSubjectLink = { class_group_id: string; subject_id: string };

export const NO_CLASS_SUBJECTS: ClassSubjectLink[] = [];

/** Disciplinas da turma; sem nenhuma configurada para ela, fica o catálogo da escola. */
export function subjectsOfClass<T extends { id: string }>(
  subjects: T[],
  classSubjects: ClassSubjectLink[],
  classGroupId: string,
): T[] {
  const ids = new Set(
    classSubjects.filter((row) => row.class_group_id === classGroupId).map((row) => row.subject_id),
  );
  if (ids.size === 0) return subjects;
  return subjects.filter((subject) => ids.has(subject.id));
}
