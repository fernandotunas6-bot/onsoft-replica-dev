import { describe, expect, it } from "vitest";
import { validateAssessmentPlanAlignment, type AssessmentBlueprint } from "./assessmentPlanAlignment";
import type { AssessmentSession } from "./assessmentCalendar";
import type { LessonPlan } from "./lessonPlanReconciliation";
const session: AssessmentSession = { id: "exam1", windowId: "w1", date: "2026-12-05",
  startsAt: "08:00", endsAt: "09:30", classGroupId: "9A", subjectId: "math",
  invigilatorIds: ["t1"], grade: 9 };
const plan: LessonPlan = { id: "p1", schoolId: "s1", teacherId: "t1", classGroupId: "9A",
  subjectId: "math", occurrenceId: "l1@2026-10-01", date: "2026-10-01", periodId: "term1",
  curriculumUnitId: "fractions", objectives: ["add-fractions"],
  teachingMethods: ["exercises"], resources: ["book"], assessmentCriteria: ["accuracy"],
  plannedMinutes: 45, status: "approved", approvedBy: "coordinator" };
const blueprint: AssessmentBlueprint = { id: "b1", schoolId: "s1", periodId: "term1",
  classGroupId: "9A", subjectId: "math", sessionId: "exam1",
  curriculumUnitIds: ["fractions"], objectiveIds: ["add-fractions"], maximumPoints: 20,
  questions: [{ id: "q1", objectiveId: "add-fractions", points: 20 }],
  status: "approved", approvedBy: "coordinator" };
const base = { blueprint, session, schoolId: "s1", periodId: "term1", approvedPlans: [plan] };
describe("matriz de avaliação e plano curricular", () => {
  it("valida a prova alinhada ao plano aprovado e à cotação", () => {
    expect(validateAssessmentPlanAlignment(base)).toEqual({ ready: true, issues: [] });
  });
  it("bloqueia prova sem aprovação ou cotação correcta", () => {
    expect(validateAssessmentPlanAlignment({ ...base, blueprint: { ...blueprint,
      status: "draft", maximumPoints: 19 } }).ready).toBe(false);
  });
  it("bloqueia conteúdos ainda não planificados antes da prova", () => {
    expect(validateAssessmentPlanAlignment({ ...base, approvedPlans: [{ ...plan,
      date: "2026-12-06" }] }).ready).toBe(false);
  });
  it("isola matrizes de outras escolas e rejeita questões sem objectivos", () => {
    expect(validateAssessmentPlanAlignment({ ...base, blueprint: { ...blueprint,
      schoolId: "s2", questions: [{ id: "q1", objectiveId: "unknown", points: 20 }] } }).ready).toBe(false);
  });
});