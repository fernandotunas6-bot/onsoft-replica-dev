import { describe, expect, it } from "vitest";
import { validatePeriodClosure, type PeriodClosureInput } from "./periodClosure";
const base: PeriodClosureInput = {
  schoolId: "school1",
  academicYearId: "2026-27",
  periodId: "term1",
  publishedScheduleVersion: "v3",
  curriculumVersion: "curriculum1",
  expectedOccurrenceIds: ["lesson1@2026-09-21", "lesson2@2026-09-22"],
  reconciledOccurrenceIds: ["lesson1@2026-09-21"],
  excusedOccurrenceIds: ["lesson2@2026-09-22"],
  expectedAssessmentIds: ["test1"],
  approvedAssessmentIds: ["test1"],
  pendingGradeAppealIds: [],
  pendingExamConflictIds: [],
  coordinatorApproved: true,
  pedagogicalDirectorApproved: true,
};
describe("fecho rigoroso do período lectivo", () => {
  it("aceita apenas período totalmente conciliado e aprovado", () => {
    expect(validatePeriodClosure(base)).toEqual({
      ready: true,
      missingLessonIds: [],
      missingAssessmentIds: [],
      blockers: [],
    });
  });
  it("bloqueia aulas por conciliar, provas por aprovar e reclamações pendentes", () => {
    const result = validatePeriodClosure({
      ...base,
      reconciledOccurrenceIds: [],
      approvedAssessmentIds: [],
      pendingGradeAppealIds: ["appeal1"],
    });
    expect(result.ready).toBe(false);
    expect(result.missingLessonIds).toEqual(["lesson1@2026-09-21"]);
    expect(result.missingAssessmentIds).toEqual(["test1"]);
    expect(result.blockers.some((item) => item.includes("Reclamações"))).toBe(true);
  });
  it("impede cruzamento de aulas estranhas ao horário ou dupla justificação", () => {
    expect(
      validatePeriodClosure({ ...base, reconciledOccurrenceIds: ["lesson1@2026-09-21", "foreign"] })
        .ready,
    ).toBe(false);
    expect(
      validatePeriodClosure({
        ...base,
        excusedOccurrenceIds: ["lesson1@2026-09-21", "lesson2@2026-09-22"],
      }).ready,
    ).toBe(false);
  });
  it("exige assinaturas institucionais e versão publicada", () => {
    expect(validatePeriodClosure({ ...base, pedagogicalDirectorApproved: false }).ready).toBe(
      false,
    );
    expect(validatePeriodClosure({ ...base, publishedScheduleVersion: "" }).ready).toBe(false);
  });
});
