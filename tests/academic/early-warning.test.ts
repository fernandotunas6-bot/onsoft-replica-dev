import { describe, expect, it } from "vitest";
import { DEFAULT_PROMOTION_RULES } from "@/features/academic/assessment-model";
import {
  classWarnings,
  studentWarnings,
  type WarningRule,
} from "@/features/academic/early-warning";

const rule: WarningRule = {
  passing: 10,
  promotionRules: DEFAULT_PROMOTION_RULES,
  maximumAbsencePercentage: 30,
  cycle: "i_ciclo",
};
const g = (subjectId: string, term: number, average: number) => ({
  subjectId,
  subjectName: subjectId.toUpperCase(),
  term,
  average,
});

describe("sinais automáticos de risco", () => {
  it("aluno sem sinais não aparece", () => {
    expect(
      studentWarnings(
        {
          enrollmentId: "1",
          name: "Ana",
          grades: [g("mat", 1, 14), g("por", 1, 13)],
          absencePercentage: 5,
        },
        rule,
      ),
    ).toBeNull();
  });

  it("não transitaria pela regra do ciclo (I ciclo: mais de 2 negativas)", () => {
    const w = studentWarnings(
      {
        enrollmentId: "1",
        name: "Bruno",
        grades: [g("a", 1, 16), g("b", 1, 16), g("c", 1, 9), g("d", 1, 9), g("e", 1, 9)],
        absencePercentage: null,
      },
      rule,
    );
    expect(w?.level).toBe("alto");
    expect(w?.signals[0].label).toMatch(/não transitaria \(média 11.8, 3 negativa/);
  });

  it("no II ciclo, uma negativa leva a exame", () => {
    const w = studentWarnings(
      {
        enrollmentId: "1",
        name: "Carla",
        grades: [g("a", 1, 14), g("b", 1, 9)],
        absencePercentage: null,
      },
      { ...rule, cycle: "ii_ciclo" },
    );
    expect(w?.signals[0].label).toMatch(/iria a exame/);
  });

  it("passou a negativa e faltas perto do limite dão risco médio", () => {
    const w = studentWarnings(
      {
        enrollmentId: "1",
        name: "Daniel",
        grades: [g("mat", 1, 12), g("mat", 2, 9), g("por", 1, 15), g("por", 2, 15)],
        absencePercentage: 25,
      },
      rule,
    );
    expect(w?.level).toBe("médio");
    expect(w?.signals.map((s) => s.label)).toEqual([
      "Passou a negativa em MAT",
      "Faltas perto do limite (25% de 30%)",
    ]);
  });

  it("faltas acima do limite do modelo são risco alto; sem limite, não há sinal de faltas", () => {
    const student = {
      enrollmentId: "1",
      name: "Eva",
      grades: [g("a", 1, 15)],
      absencePercentage: 31,
    };
    expect(studentWarnings(student, rule)?.signals[0].label).toBe(
      "Faltas acima do limite (31% de 30%)",
    );
    expect(studentWarnings(student, { ...rule, maximumAbsencePercentage: null })).toBeNull();
  });

  it("ordena risco alto primeiro", () => {
    const list = classWarnings(
      [
        {
          enrollmentId: "m",
          name: "Médio",
          grades: [g("a", 1, 12), g("a", 2, 9), g("b", 1, 15), g("b", 2, 15)],
          absencePercentage: null,
        },
        { enrollmentId: "a", name: "Alto", grades: [g("a", 1, 5)], absencePercentage: null },
      ],
      rule,
    );
    expect(list.map((w) => w.name)).toEqual(["Alto", "Médio"]);
  });
});
