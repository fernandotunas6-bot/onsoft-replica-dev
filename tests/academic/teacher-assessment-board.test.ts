import { describe, expect, it } from "vitest";
import {
  componentLabel,
  componentState,
  daysUntil,
  deadlineLabel,
  pickCurrentTerm,
  shouldRemindDeadline,
} from "@/features/academic/teacher-assessment-board";

describe("componentes da pauta", () => {
  it("estado por alunos lançados", () => {
    expect(componentState(30, 30)).toBe("done");
    expect(componentState(12, 30)).toBe("partial");
    expect(componentState(0, 30)).toBe("none");
    expect(componentState(0, 0)).toBe("no-students");
  });

  it("rótulos", () => {
    expect(componentLabel("MAC", 30, 30)).toBe("MAC lançada");
    expect(componentLabel("NPP", 12, 30)).toBe("NPP 12/30");
    expect(componentLabel("NPT", 0, 30)).toBe("NPT por lançar");
  });
});

describe("prazo", () => {
  it("dias até ao fim do período", () => {
    expect(daysUntil("2026-12-18", "2026-12-11")).toBe(7);
    expect(daysUntil("2026-12-18", "2026-12-18")).toBe(0);
    expect(daysUntil("2026-12-18", "2026-12-20")).toBe(-2);
    expect(deadlineLabel(1)).toBe("O lançamento fecha amanhã");
    expect(deadlineLabel(-2)).toBe("O período já terminou");
  });

  it("lembra só a 7, 3 e 1 dia e só com notas por lançar", () => {
    expect(shouldRemindDeadline(7, 2)).toBe(true);
    expect(shouldRemindDeadline(5, 2)).toBe(false);
    expect(shouldRemindDeadline(1, 0)).toBe(false);
  });

  it("período em curso, senão o próximo, senão o último", () => {
    const terms = [
      { sequence: 1, starts_on: "2026-09-01", ends_on: "2026-12-18" },
      { sequence: 2, starts_on: "2027-01-05", ends_on: "2027-04-02" },
    ];
    expect(pickCurrentTerm(terms, "2026-10-01")?.sequence).toBe(1);
    expect(pickCurrentTerm(terms, "2026-12-25")?.sequence).toBe(2);
    expect(pickCurrentTerm(terms, "2027-06-01")?.sequence).toBe(2);
    expect(pickCurrentTerm([], "2027-06-01")).toBeNull();
  });
});
