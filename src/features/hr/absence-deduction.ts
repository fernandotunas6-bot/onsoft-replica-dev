import { roundHalfUp } from "@/lib/angola-academic";

export type SalaryAmendment = {
  new_base_salary_kz: unknown;
  effective_on: string;
  created_at?: string;
};

/**
 * Salário base em vigor numa data: a última alteração salarial com efeito até essa
 * data, senão o salário do contrato — a regra de `hr_calculate_payroll_run`.
 */
export function baseSalaryOn(
  contractBase: unknown,
  amendments: SalaryAmendment[],
  date: string,
): number {
  const current = amendments
    .filter((amendment) => amendment.effective_on <= date)
    .sort(
      (a, b) =>
        b.effective_on.localeCompare(a.effective_on) ||
        String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")),
    )[0];
  return Number(current ? current.new_base_salary_kz : (contractBase ?? 0));
}

/**
 * Desconto estimado de uma falta, com a mesma fórmula da folha:
 * salário do dia / divisor mensal × minutos / jornada × multiplicador, ao cêntimo.
 * O ecrã usava sempre o salário do contrato, e a folha o salário em vigor na data
 * da falta: depois de uma alteração salarial os dois diferiam (auditoria 14).
 */
export function estimateAbsenceDeduction(input: {
  baseSalary: number;
  monthlyDivisorDays: number;
  standardWorkdayMinutes: number;
  durationMinutes: number;
  multiplier: number;
}): number {
  return roundHalfUp(
    (input.baseSalary / input.monthlyDivisorDays) *
      (input.durationMinutes / input.standardWorkdayMinutes) *
      input.multiplier,
    2,
  );
}
