export type TeacherAssignmentLink = {
  class_group_id: string;
  subject_id: string;
  status?: string | null;
};

export function subjectIdsForTeacherAssignment({
  classGroupId,
  subjectIds,
  classSubjectLinks,
}: {
  classGroupId: string;
  subjectIds: string[];
  classSubjectLinks: TeacherAssignmentLink[];
}) {
  if (!classGroupId || classSubjectLinks.length === 0) return subjectIds;

  const linked = [
    ...new Set(
      classSubjectLinks
        .filter(
          (row) =>
            row.class_group_id === classGroupId &&
            row.status !== "inactive" &&
            row.status !== "closed",
        )
        .map((row) => row.subject_id),
    ),
  ];

  // Compatibilidade: uma turma sem currículo/class_subjects ainda precisa de
  // conseguir fazer a primeira atribuição. O backend cria essa ligação com
  // validação school_id. Quando já há currículo, a lista passa a ser estrita.
  return linked.length > 0 ? linked : subjectIds;
}
