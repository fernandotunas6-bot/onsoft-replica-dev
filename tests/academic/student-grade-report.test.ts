import { describe, expect, it } from "vitest";
import {
  buildSubjectYearReport,
  buildTermGrade,
  outlookLabel,
  overallAverage,
  passOutlook,
} from "@/features/academic/student-grade-report";

describe("buildTermGrade", () => {
  it("MT = (MAC + NPT) / 2 e nota em falta não conta como zero", () => {
    expect(buildTermGrade({ mac: 12, npp: 14, npt: 16 }).mt).toBe(14);
    expect(buildTermGrade({ mac: 12 }).mt).toBe(12);
    expect(buildTermGrade({}).mt).toBeNull();
  });

  it("rejeita notas fora da escala 0–20", () => {
    expect(buildTermGrade({ mac: 25, npt: 10 }).mac).toBeNull();
  });
});

describe("passOutlook", () => {
  it("sem notas, não inventa perspectiva", () => {
    expect(passOutlook([null, null, null], 3)).toEqual({ kind: "no-data" });
  });

  it("calcula a média necessária nos trimestres que faltam", () => {
    // 3 × 10 = 30; já tem 8 → faltam 22 em 2 trimestres = 11
    expect(passOutlook([8, null, null], 3)).toEqual({
      kind: "needs",
      average: 11,
      remainingTerms: 2,
    });
    // 30 − (9 + 8) = 13 no último
    expect(passOutlook([9, 8, null], 3)).toEqual({ kind: "needs", average: 13, remainingTerms: 1 });
  });

  it("arredonda para cima à décima", () => {
    // 30 − (9.5 + 9.6) = 10.9 → 10.9 ; 30 − 9.55×… usa ceil
    expect(passOutlook([9.5, 9.6, null], 3)).toMatchObject({ average: 10.9 });
    expect(passOutlook([9.45, null, null], 3)).toMatchObject({ average: 10.3 });
  });

  it("garantida e inalcançável", () => {
    expect(passOutlook([20, 12, null], 3)).toEqual({ kind: "secured" });
    expect(passOutlook([2, 3, null], 3)).toEqual({ kind: "unreachable", remainingTerms: 1 });
  });

  it("ano completo: aprovado ou não", () => {
    expect(passOutlook([10, 9, 11], 3)).toEqual({ kind: "complete", passed: true });
    expect(passOutlook([9, 9, 11], 3)).toEqual({ kind: "complete", passed: false });
  });

  it("respeita a nota de aprovação da regra e ciclos semestrais", () => {
    expect(passOutlook([12, null], 2, 14)).toEqual({
      kind: "needs",
      average: 16,
      remainingTerms: 1,
    });
  });
});

describe("buildSubjectYearReport", () => {
  it("média final dos trimestres disponíveis e rótulo", () => {
    const report = buildSubjectYearReport({
      subjectId: "m",
      subjectName: "Matemática",
      terms: [buildTermGrade({ mac: 8, npt: 8 }), null, null],
      termCount: 3,
    });
    expect(report.finalAverage).toBe(8);
    expect(report.passing).toBe(10);
    expect(outlookLabel(report.outlook)).toBe(
      "Precisa de 11.0 de média nos 2 trimestres que faltam",
    );
    expect(overallAverage([report])).toBe(8);
  });
});
