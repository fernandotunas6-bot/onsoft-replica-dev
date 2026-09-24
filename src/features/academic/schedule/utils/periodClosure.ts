/**
 * Fail-closed academic-period readiness gate. The server must populate all
 * inputs from authoritative, versioned school records; this is not an API.
 */
export type PeriodClosureInput = {
  schoolId: string; academicYearId: string; periodId: string;
  publishedScheduleVersion: string; curriculumVersion: string;
  expectedOccurrenceIds: readonly string[];
  reconciledOccurrenceIds: readonly string[];
  excusedOccurrenceIds: readonly string[];
  expectedAssessmentIds: readonly string[];
  approvedAssessmentIds: readonly string[];
  pendingGradeAppealIds: readonly string[];
  pendingExamConflictIds: readonly string[];
  coordinatorApproved: boolean; pedagogicalDirectorApproved: boolean;
};
export type PeriodClosureResult = {
  ready: boolean; missingLessonIds: string[]; missingAssessmentIds: string[];
  blockers: string[];
};
function duplicates(ids: readonly string[]): boolean {
  return ids.some((id) => !id.trim()) || new Set(ids).size !== ids.length;
}
export function validatePeriodClosure(input: PeriodClosureInput): PeriodClosureResult {
  const blockers: string[] = [];
  if (!input.schoolId || !input.academicYearId || !input.periodId ||
      !input.publishedScheduleVersion || !input.curriculumVersion) {
    blockers.push("Identidade institucional ou versões oficiais incompletas.");
  }
  const collections = [input.expectedOccurrenceIds, input.reconciledOccurrenceIds,
    input.excusedOccurrenceIds, input.expectedAssessmentIds, input.approvedAssessmentIds,
    input.pendingGradeAppealIds, input.pendingExamConflictIds];
  if (collections.some(duplicates)) blockers.push("Identificadores inválidos ou duplicados.");
  const expectedLessons = new Set(input.expectedOccurrenceIds);
  const reconciled = new Set(input.reconciledOccurrenceIds);
  const excused = new Set(input.excusedOccurrenceIds);
  if ([...reconciled].some((id) => !expectedLessons.has(id)) ||
      [...excused].some((id) => !expectedLessons.has(id)) ||
      [...reconciled].some((id) => excused.has(id))) {
    blockers.push("Aulas conciliadas ou justificadas divergem do horário publicado.");
  }
  const missingLessonIds = [...expectedLessons].filter((id) => !reconciled.has(id) && !excused.has(id));
  if (missingLessonIds.length) blockers.push("Aulas previstas sem conciliação ou justificação.");
  const expectedAssessments = new Set(input.expectedAssessmentIds);
  const approved = new Set(input.approvedAssessmentIds);
  if ([...approved].some((id) => !expectedAssessments.has(id))) {
    blockers.push("Avaliação aprovada não pertence ao período.");
  }
  const missingAssessmentIds = [...expectedAssessments].filter((id) => !approved.has(id));
  if (missingAssessmentIds.length) blockers.push("Avaliações previstas sem aprovação.");
  if (input.pendingGradeAppealIds.length) blockers.push("Reclamações de notas ainda pendentes.");
  if (input.pendingExamConflictIds.length) blockers.push("Conflitos de exames ainda pendentes.");
  if (!input.coordinatorApproved || !input.pedagogicalDirectorApproved) {
    blockers.push("Aprovação da coordenação e da direcção pedagógica obrigatória.");
  }
  return { ready: blockers.length === 0, missingLessonIds, missingAssessmentIds, blockers };
}
