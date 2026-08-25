import { describe, expect, it } from "vitest";
import {
  calculateTrimesterAverage,
  calculateDisciplineFinalAverage,
  evaluateStudentPromotion,
  buildClassAcademicSummaries,
  normalizeScore,
} from "@/features/academic/assessment-engine";

describe("SIGA AssessmentEngine — Fonte Única de Dados Académicos", () => {
  it("normalizes score inputs strictly between 0 and 20", () => {
    expect(normalizeScore(14)).toBe(14);
    expect(normalizeScore("15 text")).toBeNull();
    expect(normalizeScore(-2)).toBeNull();
    expect(normalizeScore(21)).toBeNull();
    expect(normalizeScore(null)).toBeNull();
  });

  it("calculates trimester average MT = (MACT + NPT) / 2 under Decreto 424/25", () => {
    expect(calculateTrimesterAverage(14, 12)).toBe(13);
    expect(calculateTrimesterAverage(10, 8)).toBe(9);
    expect(calculateTrimesterAverage(15, null)).toBe(15);
  });

  it("calculates discipline final average MFD = (MT1 + MT2 + MT3) / 3", () => {
    expect(calculateDisciplineFinalAverage(12, 14, 14)).toBe(13.3);
    expect(calculateDisciplineFinalAverage(10, 10, 10)).toBe(10);
    expect(calculateDisciplineFinalAverage(10, null, null)).toBe(10);
  });

  it("evaluates promotion status accurately according to Angolan teaching cycle", () => {
    const passingSubjects = [
      { subjectId: "lp", subjectName: "Língua Portuguesa", mt1: 12, mt2: 13, mt3: 14, mfd: 13 },
      { subjectId: "mat", subjectName: "Matemática", mt1: 10, mt2: 11, mt3: 12, mfd: 11 },
    ];

    expect(evaluateStudentPromotion({ subjectResults: passingSubjects, cycle: "i_ciclo" }).status).toBe("TRANSITA");
    expect(evaluateStudentPromotion({ subjectResults: passingSubjects, cycle: "tecnico", papGrade: 15 }).status).toBe("APTO (PAP)");
    expect(evaluateStudentPromotion({ subjectResults: passingSubjects, cycle: "tecnico", papGrade: 8 }).status).toBe("NÃO APTO (PAP)");
  });

  it("builds complete class academic summaries without divergence", () => {
    const enrollments = [{ id: "e1", student_name: "Ana Manuel", registration_number: "2026001" }];
    const subjects = [{ id: "lp", name: "Língua Portuguesa" }, { id: "mat", name: "Matemática" }];
    const termGrades = [
      { id: "g1", enrollment_id: "e1", subject_id: "lp", term: 1 as const, mac: 14, npp: 14, npt: 12 },
      { id: "g2", enrollment_id: "e1", subject_id: "lp", term: 2 as const, mac: 15, npp: 15, npt: 14 },
      { id: "g3", enrollment_id: "e1", subject_id: "lp", term: 3 as const, mac: 16, npp: 16, npt: 14 },
    ];

    const summaries = buildClassAcademicSummaries({ enrollments, subjects, termGrades, cycle: "i_ciclo" });
    expect(summaries.length).toBe(1);
    expect(summaries[0].studentName).toBe("Ana Manuel");
    expect(summaries[0].subjects[0].mfd).toBe(14.2);
    expect(summaries[0].status).toBe("TRANSITA");
  });
});
