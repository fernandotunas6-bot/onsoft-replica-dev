import type { LessonOccurrence } from "./academicTime";
import { parseCivilDate, parseLocalMinute } from "./academicTime";

export type LessonPlan = {
  id: string;
  schoolId: string;
  teacherId: string;
  classGroupId: string;
  subjectId: string;
  occurrenceId: string;
  date: string;
  periodId: string;
  curriculumUnitId: string;
  objectives: readonly string[];
  teachingMethods: readonly string[];
  resources: readonly string[];
  assessmentCriteria: readonly string[];
  plannedMinutes: number;
  status: "draft" | "submitted" | "approved" | "returned";
  approvedBy?: string;
};
export type TeachingRecord = {
  occurrenceId: string;
  schoolId: string;
  teacherId: string;
  actualCurriculumUnitIds: readonly string[];
  deliveredMinutes: number;
  status: "delivered" | "partially_delivered" | "cancelled" | "pending";
  evidenceIds: readonly string[];
  replacementApproved?: boolean;
};
export type PlanReconciliation = {
  occurrenceId: string;
  state: "aligned" | "pending_review" | "not_delivered";
  coveragePercent: number | null;
  issues: string[];
};
export function reconcileLessonPlan(input: {
  occurrence: LessonOccurrence;
  schoolId: string;
  subjectId: string;
  plan?: LessonPlan;
  record?: TeachingRecord;
}): PlanReconciliation {
  const { occurrence, schoolId, subjectId, plan, record } = input;
  parseCivilDate(occurrence.date);
  const scheduled = parseLocalMinute(occurrence.end) - parseLocalMinute(occurrence.start);
  if (!schoolId || !subjectId || scheduled <= 0)
    throw new Error("Ocorrência ou instituição inválida.");
  const key = occurrence.id + "@" + occurrence.date;
  const issues: string[] = [];
  if (!plan) issues.push("Plano de aula em falta.");
  else {
    if (
      plan.schoolId !== schoolId ||
      plan.teacherId !== occurrence.teacherId ||
      plan.classGroupId !== occurrence.classGroupId ||
      plan.subjectId !== subjectId ||
      plan.periodId !== occurrence.periodId ||
      plan.date !== occurrence.date ||
      plan.occurrenceId !== key
    )
      issues.push("Plano não corresponde à aula publicada.");
    if (
      !plan.curriculumUnitId.trim() ||
      !plan.objectives.length ||
      !plan.objectives.every((item) => item.trim()) ||
      !plan.teachingMethods.length ||
      !plan.assessmentCriteria.length
    )
      issues.push("Plano pedagógico incompleto.");
    if (plan.plannedMinutes !== scheduled)
      issues.push("Duração do plano diverge do horário publicado.");
    if (plan.status !== "approved" || !plan.approvedBy?.trim())
      issues.push("Plano sem aprovação pedagógica.");
  }
  if (!record || record.status === "pending") {
    issues.push("Execução da aula ainda não confirmada.");
    return { occurrenceId: key, state: "pending_review", coveragePercent: null, issues };
  }
  if (
    record.schoolId !== schoolId ||
    record.teacherId !== occurrence.teacherId ||
    record.occurrenceId !== key
  )
    issues.push("Registo de execução não corresponde à aula.");
  if (
    !Number.isSafeInteger(record.deliveredMinutes) ||
    record.deliveredMinutes < 0 ||
    record.deliveredMinutes > scheduled
  )
    issues.push("Minutos leccionados inválidos.");
  if (record.status === "cancelled") {
    issues.push("Aula cancelada; verificar reposição ou justificação.");
    return { occurrenceId: key, state: "pending_review", coveragePercent: null, issues };
  }
  if (!record.evidenceIds.length) issues.push("Execução sem evidências.");
  if (plan && !record.actualCurriculumUnitIds.includes(plan.curriculumUnitId)) {
    issues.push("Conteúdo leccionado diverge do plano aprovado.");
  }
  if (record.status === "partially_delivered" || record.deliveredMinutes < scheduled) {
    issues.push("Aula parcialmente leccionada; requer acompanhamento.");
  }
  const coveragePercent =
    record.deliveredMinutes >= 0 && record.deliveredMinutes <= scheduled
      ? Math.round((record.deliveredMinutes * 100) / scheduled)
      : null;
  return {
    occurrenceId: key,
    state: issues.length ? "pending_review" : "aligned",
    coveragePercent,
    issues,
  };
}
