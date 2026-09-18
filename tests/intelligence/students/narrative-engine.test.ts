import { describe, expect, it } from "vitest";
import { generateStudentNarrativeReport } from "@/features/intelligence/narrative-engine";
import type { StudentRelationsSnapshot } from "@/features/intelligence/students/student-relations-adapter";

const baseSnapshot: StudentRelationsSnapshot = {
  studentId: "123",
  enrollment: { id: "en-1", classId: "class-1", className: "10A" },
  finance: { overdueCount: 0 },
  academic: { finalAverage: null, absences: 0 },
  documents: { hasData: false, pendingCount: 0 },
  guardians: { count: 1 },
};

describe("generateStudentNarrativeReport", () => {
  it("gera relatório de aluno excelente", () => {
    const text = generateStudentNarrativeReport(
      { ...baseSnapshot, academic: { finalAverage: 15, absences: 0 } },
      "João",
    );
    expect(text).toContain("Excelente desempenho");
    expect(text).toContain("15");
    expect(text).toContain("Assiduidade perfeita");
    expect(text).toContain("Situação financeira regularizada");
  });

  it("gera relatório de aluno com dificuldades e dívidas", () => {
    const text = generateStudentNarrativeReport(
      {
        ...baseSnapshot,
        academic: { finalAverage: 8, absences: 6 },
        finance: { overdueCount: 2 },
      },
      "Maria",
    );
    expect(text).toContain("abaixo do exigido");
    expect(text).toContain("8");
    expect(text).toContain("Registo de 6 faltas não justificadas");
    expect(text).toContain("Lembrete Financeiro");
  });
});
