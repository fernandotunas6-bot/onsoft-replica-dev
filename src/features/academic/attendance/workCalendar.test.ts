import { describe, expect, it } from "vitest";
import { calculateWorkCalendar } from "./workCalendar";

describe("calendário de trabalho escolar", () => {
  const base = { year: 2026, month: 9, weekdays: [1, 2, 3, 4, 5], holidays: [] as string[], referenceWorkingDays: 22 };
  it("calcula dias úteis reais sem impor os 22 de referência", () => {
    const result = calculateWorkCalendar(base);
    expect(result.workingDays).toBe(22);
    expect(result.referenceWorkingDays).toBe(22);
    expect(result.workingDates).toContain("2026-09-24");
  });
  it("exclui feriados e encerramentos e permite sábado letivo excecional", () => {
    const result = calculateWorkCalendar({ ...base,
      holidays: ["2026-09-17"], exceptionalDaysOff: ["2026-09-18"],
      exceptionalWorkingDays: ["2026-09-19"] });
    expect(result.workingDays).toBe(21);
    expect(result.workingDates).not.toContain("2026-09-17");
    expect(result.workingDates).toContain("2026-09-19");
  });
  it("rejeita datas inexistentes, conflitos e exceções de outro mês", () => {
    expect(() => calculateWorkCalendar({ ...base, holidays: ["2026-09-31"] })).toThrow();
    expect(() => calculateWorkCalendar({ ...base, holidays: ["2026-10-01"] })).toThrow();
    expect(() => calculateWorkCalendar({ ...base, holidays: ["2026-09-17"], exceptionalWorkingDays: ["2026-09-17"] })).toThrow();
  });
  it("preserva meses com número diferente de dias úteis", () => {
    const result = calculateWorkCalendar({ ...base, month: 2 });
    expect(result.workingDays).toBe(20);
    expect(result.differenceFromReference).toBe(-2);
  });
});
