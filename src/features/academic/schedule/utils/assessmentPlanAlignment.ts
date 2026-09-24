import type { LessonPlan } from "./lessonPlanReconciliation";
import type { AssessmentSession } from "./assessmentCalendar";

/** Pedagogical alignment is independent of teacher attendance and payroll. */
export type AssessmentBlueprint = {
  id: string; schoolId: string; periodId: string; classGroupId: string; subjectId: string;
  sessionId: string; curriculumUnitIds: readonly string[];
  objectiveIds: readonly string[]; maximumPoints: number;
  questions: readonly { id: string; objectiveId: string; points: number }[];
  status: "draft" | "submitted" | "approved"; approvedBy?: string;
};
export type AlignmentResult = { ready: boolean; issues: string[] };
export function validateAssessmentPlanAlignment(input: {
  blueprint: AssessmentBlueprint; session: AssessmentSession;
  schoolId: string; periodId: string; approvedPlans: readonly LessonPlan[];
}): AlignmentResult {
  const { blueprint, session, schoolId, periodId, approvedPlans } = input;
  const issues: string[] = [];
  if (!schoolId || blueprint.schoolId !== schoolId || blueprint.periodId !== periodId ||
      blueprint.sessionId !== session.id || blueprint.classGroupId !== session.classGroupId ||
      blueprint.subjectId !== session.subjectId) {
    issues.push("Matriz de avaliação não corresponde à instituição, período, turma ou disciplina.");
  }
  if (blueprint.status !== "approved" || !blueprint.approvedBy?.trim()) {
    issues.push("Matriz de avaliação sem aprovação pedagógica.");
  }
  if (!Number.isSafeInteger(blueprint.maximumPoints) || blueprint.maximumPoints <= 0 ||
      !blueprint.questions.length || !blueprint.objectiveIds.length ||
      new Set(blueprint.questions.map((q) => q.id)).size !== blueprint.questions.length ||
      new Set(blueprint.objectiveIds).size !== blueprint.objectiveIds.length ||
      blueprint.objectiveIds.some((id) => !id.trim())) {
    issues.push("Matriz de avaliação incompleta ou duplicada.");
  }
  const relevantPlans = approvedPlans.filter((p) => p.schoolId === schoolId &&
    p.periodId === periodId && p.classGroupId === session.classGroupId &&
    p.subjectId === session.subjectId && p.status === "approved" && !!p.approvedBy?.trim() &&
    p.date <= session.date);
  const units = new Set(relevantPlans.map((p) => p.curriculumUnitId));
  const objectives = new Set(relevantPlans.flatMap((p) => [...p.objectives]));
  if (!blueprint.curriculumUnitIds.length ||
      blueprint.curriculumUnitIds.some((id) => !units.has(id))) {
    issues.push("A matriz inclui unidades sem plano aprovado anterior à prova.");
  }
  if (blueprint.objectiveIds.some((id) => !objectives.has(id))) {
    issues.push("A matriz inclui objectivos sem plano aprovado anterior à prova.");
  }
  let points = 0;
  for (const question of blueprint.questions) {
    if (!question.objectiveId || !blueprint.objectiveIds.includes(question.objectiveId) ||
        !Number.isSafeInteger(question.points) || question.points <= 0) {
      issues.push("Questão sem objectivo válido ou pontuação inválida.");
      continue;
    }
    points += question.points;
  }
  if (points !== blueprint.maximumPoints) {
    issues.push("A soma das questões não corresponde à cotação da prova.");
  }
  return { ready: issues.length === 0, issues };
}
