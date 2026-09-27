import { describe, expect, it } from "vitest";
import {
  reconcileLessonPlan,
  type LessonPlan,
  type TeachingRecord,
} from "./lessonPlanReconciliation";
const occurrence = {
  id: "math1",
  periodId: "term1",
  shiftId: "morning",
  weekday: 1,
  start: "08:00",
  end: "08:45",
  teacherId: "teacher1",
  classGroupId: "9A",
  date: "2026-09-21",
  startsAtLocal: "2026-09-21T08:00",
  endsAtLocal: "2026-09-21T08:45",
};
const plan: LessonPlan = {
  id: "plan1",
  schoolId: "school1",
  teacherId: "teacher1",
  classGroupId: "9A",
  subjectId: "math",
  occurrenceId: "math1@2026-09-21",
  date: "2026-09-21",
  periodId: "term1",
  curriculumUnitId: "fractions",
  objectives: ["Resolver frações"],
  teachingMethods: ["Exercícios"],
  resources: ["Manual"],
  assessmentCriteria: ["Resolução correta"],
  plannedMinutes: 45,
  status: "approved",
  approvedBy: "coordinator1",
};
const record: TeachingRecord = {
  occurrenceId: "math1@2026-09-21",
  schoolId: "school1",
  teacherId: "teacher1",
  actualCurriculumUnitIds: ["fractions"],
  deliveredMinutes: 45,
  status: "delivered",
  evidenceIds: ["qr-in", "qr-out"],
};
const base = { occurrence, schoolId: "school1", subjectId: "math", plan, record };
describe("conciliação de plano e execução docente", () => {
  it("concilia aula prevista, aprovada e executada", () => {
    expect(reconcileLessonPlan(base)).toMatchObject({
      state: "aligned",
      coveragePercent: 100,
      issues: [],
    });
  });
  it("não confunde presença QR com plano pedagógico aprovado", () => {
    expect(reconcileLessonPlan({ ...base, plan: { ...plan, status: "draft" } }).state).toBe(
      "pending_review",
    );
    expect(reconcileLessonPlan({ ...base, plan: undefined }).state).toBe("pending_review");
  });
  it("sinaliza conteúdos divergentes e aulas parciais", () => {
    const result = reconcileLessonPlan({
      ...base,
      record: {
        ...record,
        actualCurriculumUnitIds: ["geometry"],
        deliveredMinutes: 30,
        status: "partially_delivered",
      },
    });
    expect(result.state).toBe("pending_review");
    expect(result.coveragePercent).toBe(67);
  });
  it("isola docentes e instituições", () => {
    expect(
      reconcileLessonPlan({ ...base, plan: { ...plan, schoolId: "other-school" } }).state,
    ).toBe("pending_review");
    expect(
      reconcileLessonPlan({ ...base, record: { ...record, teacherId: "other-teacher" } }).state,
    ).toBe("pending_review");
  });
});
