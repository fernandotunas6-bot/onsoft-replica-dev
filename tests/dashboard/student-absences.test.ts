import { describe, expect, it } from "vitest";
import { summarizeSubjectAbsences } from "@/features/dashboard/student-absences";

const names = new Map([
  ["mat", "Matemática"],
  ["ing", "Inglês"],
  ["fis", "Física"],
]);
const lessons = (subjectId: string, statuses: string[]) =>
  statuses.map((status) => ({ subjectId, status }));

describe("faltas por disciplina", () => {
  it("percentagem, faltas que ainda cabem e estado, do pior para o melhor", () => {
    const out = summarizeSubjectAbsences(
      [
        // Matemática: 1 falta em 10 aulas (10 %), limite 25 % → cabem mais 1.
        ...lessons("mat", ["absent", ...Array(9).fill("present")]),
        // Inglês: 2 em 10 (20 %) → aviso (≥ 75 % do limite), cabe mais 0.
        ...lessons("ing", ["absent", "absent", "late", ...Array(7).fill("present")]),
        // Física: 3 em 8 (37,5 %) → passou o limite.
        ...lessons("fis", ["absent", "absent", "absent", ...Array(5).fill("present")]),
      ],
      names,
      25,
    );
    expect(out.subjects.map((s) => [s.subjectName, s.percentage, s.remaining, s.status])).toEqual([
      ["Física", 37.5, -1, "over"],
      ["Inglês", 20, 0, "warning"],
      ["Matemática", 10, 1, "ok"],
    ]);
    expect(out.subjects[1]!.late).toBe(1);
    expect(out.totals).toEqual({ lessons: 28, absences: 6, percentage: 21.43 });
    expect(out.limitPercentage).toBe(25);
  });

  it("justificadas e sem registo não contam para a percentagem", () => {
    const [mat] = summarizeSubjectAbsences(
      lessons("mat", ["absent", "excused", "excused", "not_registered", "present"]),
      names,
      25,
    ).subjects;
    expect(mat).toMatchObject({
      lessons: 2,
      absences: 1,
      excused: 2,
      percentage: 50,
      status: "over",
    });
  });

  it("sem limite definido: mostra as faltas sem inventar estado", () => {
    const out = summarizeSubjectAbsences(lessons("mat", ["absent", "present"]), names, null);
    expect(out.limitPercentage).toBeNull();
    expect(out.subjects[0]).toMatchObject({ percentage: 50, remaining: null, status: "unknown" });
    expect(summarizeSubjectAbsences([], names, 0).limitPercentage).toBeNull();
  });

  it("sem registos: listas vazias e percentagem nula", () => {
    expect(summarizeSubjectAbsences([], names, 25)).toEqual({
      limitPercentage: 25,
      subjects: [],
      totals: { lessons: 0, absences: 0, percentage: null },
    });
  });
});
