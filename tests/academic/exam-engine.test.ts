import { describe, expect, it } from "vitest";
import {
  applyExamResults,
  averageAfterExam,
  computeFinalResult,
  examEligibility,
  subjectFinalsFromBreakdown,
  type EngineRule,
} from "@/features/academic/exam-engine";

const rule: EngineRule = {
  passingValue: 10,
  maximumAbsencePercentage: 30,
  roundingMethod: "nearest",
  decimalPlaces: 0,
  keySubjectsCauseFailure: true,
};

// Pauta anual: uma entrada por disciplina e período.
const breakdown = [
  { subjectId: "mat", subject: "Matemática", average: 8, isKeySubject: true },
  { subjectId: "mat", subject: "Matemática", average: 9 },
  { subjectId: "mat", subject: "Matemática", average: 8 },
  { subjectId: "por", subject: "Português", average: "14" },
  { subjectId: "por", subject: "Português", average: 13 },
  { subjectId: "fis", subject: "Física", average: 9 },
  { subjectId: "fis", subject: "Física", average: null },
  { subject: "Sem id", average: 5 },
];

describe("motor de exames", () => {
  it("junta a pauta anual numa média por disciplina", () => {
    const subjects = subjectFinalsFromBreakdown(breakdown, rule);
    expect(subjects.map((s) => [s.subjectId, s.average, s.isKeySubject])).toEqual([
      ["fis", 9, false],
      ["mat", 8, true],
      ["por", 14, false],
    ]);
  });

  it("elegibilidade pelas negativas, faltas e máximo da época", () => {
    const subjects = subjectFinalsFromBreakdown(breakdown, rule);
    const recurso = { kind: "recurso" as const, maxFailedSubjects: null };
    const ok = examEligibility({ subjects, absencePercentage: 5 }, rule, recurso);
    expect(ok.eligible && ok.subjects.map((s) => s.subjectId)).toEqual(["fis", "mat"]);

    const tooMany = examEligibility({ subjects, absencePercentage: 5 }, rule, {
      kind: "recurso",
      maxFailedSubjects: 1,
    });
    expect(tooMany).toMatchObject({ eligible: false, reason: "too-many" });

    expect(examEligibility({ subjects, absencePercentage: 40 }, rule, recurso)).toMatchObject({
      eligible: false,
      reason: "absences",
    });
    expect(examEligibility({ subjects: [], absencePercentage: 0 }, rule, recurso)).toMatchObject({
      eligible: false,
      reason: "no-grades",
    });

    const melhoria = examEligibility({ subjects, absencePercentage: 0 }, rule, {
      kind: "melhoria",
      maxFailedSubjects: null,
    });
    expect(melhoria.eligible && melhoria.subjects.map((s) => s.subjectId)).toEqual(["por"]);
  });

  it("aplica o método da época e o arredondamento da regra", () => {
    expect(averageAfterExam(8, 12, "replace", rule)).toBe(12);
    expect(averageAfterExam(8, 13, "average", rule)).toBe(11);
    expect(averageAfterExam(14, 11, "max", rule)).toBe(14);
    expect(averageAfterExam(null, 11, "average", rule)).toBe(11);
    expect(averageAfterExam(9, 10, "average", { roundingMethod: "down", decimalPlaces: 0 })).toBe(
      9,
    );
  });

  it("resultado final com a mesma regra da pauta", () => {
    const subjects = subjectFinalsFromBreakdown(breakdown, rule);
    // Negativa em disciplina-chave (Matemática) reprova, mesmo com média 10.
    expect(computeFinalResult(subjects, 5, rule)).toMatchObject({
      result: "fail",
      average: 10,
      reason: "Negativa em disciplina-chave",
    });
    // Recurso a Matemática com 12: transita (Física 9 não é chave e a média chega).
    const after = applyExamResults(subjects, [{ subjectId: "mat", finalAverage: 12 }]);
    expect(computeFinalResult(after, 5, rule)).toMatchObject({
      result: "pass",
      average: 12,
      failedSubjects: ["Física"],
    });
    expect(computeFinalResult(after, 31, rule).reason).toBe("Faltas acima do limite");
    expect(computeFinalResult([], 0, rule).result).toBe("incomplete");
    expect(
      computeFinalResult(subjects, 5, { ...rule, keySubjectsCauseFailure: false }).result,
    ).toBe("pass");
  });
});

describe("nota de exame que conta", () => {
  it("usa a época mais recente com nota, por disciplina", async () => {
    const { latestGradedBySubject } = await import("@/features/academic/exam-engine");
    expect(
      latestGradedBySubject([
        { subjectId: "mat", status: "graded", finalAverage: 10, sessionCreatedAt: "2026-07-01" },
        { subjectId: "mat", status: "graded", finalAverage: 13, sessionCreatedAt: "2026-09-01" },
        { subjectId: "mat", status: "absent", finalAverage: null, sessionCreatedAt: "2026-10-01" },
        {
          subjectId: "fis",
          status: "registered",
          finalAverage: null,
          sessionCreatedAt: "2026-07-01",
        },
        { subjectId: "por", status: "graded", finalAverage: 11, sessionCreatedAt: "2026-07-01" },
      ]),
    ).toEqual([
      { subjectId: "mat", finalAverage: 13 },
      { subjectId: "por", finalAverage: 11 },
    ]);
  });
});
