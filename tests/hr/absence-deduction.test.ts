import { describe, expect, it } from "vitest";
import { baseSalaryOn, estimateAbsenceDeduction } from "@/features/hr/absence-deduction";

/** Auditoria 14: a estimativa do ecrã segue a regra de hr_calculate_payroll_run. */
describe("desconto estimado de uma falta", () => {
  const amendments = [
    { new_base_salary_kz: 150000, effective_on: "2026-09-01", created_at: "2026-08-20" },
    { new_base_salary_kz: 180000, effective_on: "2026-11-01", created_at: "2026-10-20" },
  ];

  it("usa o salário em vigor na data da falta", () => {
    expect(baseSalaryOn(120000, amendments, "2026-08-15")).toBe(120000);
    expect(baseSalaryOn(120000, amendments, "2026-10-10")).toBe(150000);
    expect(baseSalaryOn(120000, amendments, "2026-11-01")).toBe(180000);
  });

  it("salário do dia × fracção da jornada × multiplicador, ao cêntimo", () => {
    expect(
      estimateAbsenceDeduction({
        baseSalary: 150000,
        monthlyDivisorDays: 30,
        standardWorkdayMinutes: 480,
        durationMinutes: 240,
        multiplier: 1,
      }),
    ).toBe(2500);
  });
});
