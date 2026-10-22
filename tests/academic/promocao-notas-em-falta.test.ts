import { describe, expect, it } from "vitest";
import {
  buildClassAcademicSummaries,
  evaluateStudentPromotion,
} from "@/features/academic/assessment-engine";

/** Auditoria 13, F-06: sem todas as notas não há decisão de transição. */
describe("transição com notas em falta", () => {
  const notas = (subjectId: string, terms: Array<1 | 2 | 3>, nota = 14) =>
    terms.map((term) => ({
      id: `${subjectId}-${term}`,
      enrollment_id: "e1",
      subject_id: subjectId,
      term,
      mac: nota,
      npp: null,
      npt: nota,
    }));

  it("1 de 12 disciplinas com notas → PENDENTE (antes TRANSITA)", () => {
    const subjects = Array.from({ length: 12 }, (_, i) => ({ id: `s${i}`, name: `D${i}` }));
    const [summary] = buildClassAcademicSummaries({
      enrollments: [{ id: "e1", student_name: "Teste" }],
      subjects,
      termGrades: notas("s0", [1, 2, 3]),
    });
    expect(summary!.status).toBe("PENDENTE");
  });

  it("só o 1.º trimestre lançado → PENDENTE", () => {
    const result = evaluateStudentPromotion({
      subjectResults: [
        { subjectId: "a", subjectName: "A", mt1: 14, mt2: null, mt3: null, mfd: 14 },
      ],
    });
    expect(result.status).toBe("PENDENTE");
  });

  it("semestres: dois períodos completos chegam", () => {
    const result = evaluateStudentPromotion({
      subjectResults: [{ subjectId: "a", subjectName: "A", mt1: 14, mt2: 12, mt3: null, mfd: 13 }],
      cycle: "i_ciclo",
      options: { periodCount: 2 },
    });
    expect(result.status).toBe("TRANSITA");
  });

  it("todas as notas lançadas → decide normalmente", () => {
    const [summary] = buildClassAcademicSummaries({
      enrollments: [{ id: "e1", student_name: "Teste" }],
      subjects: [
        { id: "s0", name: "A" },
        { id: "s1", name: "B" },
      ],
      termGrades: [...notas("s0", [1, 2, 3], 14), ...notas("s1", [1, 2, 3], 8)],
    });
    expect(summary!.status).not.toBe("PENDENTE");
  });

  it("o histórico usa a nota mínima do modelo, não 10 fixo", async () => {
    const { readFileSync } = await import("node:fs");
    const page = readFileSync("src/routes/alunos/$studentId.tsx", "utf8");
    expect(page).toContain("subject.mfd >= (year.passingValue ?? angolaGradeScale.passing)");
  });
});
