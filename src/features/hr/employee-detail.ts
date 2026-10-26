import type { StatusKey } from "@/lib/status-registry";

/**
 * Ficha do funcionário (SIGA Context Engine, contexto RH): o vínculo laboral, os
 * contratos, as faltas e os recibos de vencimento de uma pessoa, como o servidor
 * os lê na escola activa. Montagem pura, sem acesso à base de dados.
 */

export type HrEmployeeState = { status: StatusKey; label: string };

const EMPLOYMENT_STATES: Record<string, HrEmployeeState> = {
  active: { status: "active", label: "Activo" },
  draft: { status: "draft", label: "Rascunho" },
  suspended: { status: "suspended", label: "Suspenso" },
  terminated: { status: "inactive", label: "Cessado" },
};

export function employmentState(status: string): HrEmployeeState {
  return EMPLOYMENT_STATES[status] ?? { status: "pending", label: status || "—" };
}

const EMPLOYMENT_TYPES: Record<string, string> = {
  permanent: "Efectivo",
  fixed_term: "A termo",
  service_provider: "Prestação de serviços",
  intern: "Estágio",
  temporary: "Temporário",
  other: "Outro",
};

export function employmentTypeLabel(type: string): string {
  return EMPLOYMENT_TYPES[type] ?? (type || "—");
}

const SALARY_TYPES: Record<string, string> = {
  monthly: "Mensal",
  hourly: "Por hora",
  lesson_hour: "Por tempo lectivo",
};

export function salaryTypeLabel(type: string): string {
  return SALARY_TYPES[type] ?? (type || "—");
}

const CONTRACT_STATES: Record<string, HrEmployeeState> = {
  active: { status: "active", label: "Em vigor" },
  draft: { status: "draft", label: "Rascunho" },
  suspended: { status: "suspended", label: "Suspenso" },
  ended: { status: "closed", label: "Terminado" },
  terminated: { status: "closed", label: "Terminado" },
  cancelled: { status: "cancelled", label: "Anulado" },
};

export function contractState(status: string): HrEmployeeState {
  return CONTRACT_STATES[status] ?? { status: "pending", label: status || "—" };
}

export const ABSENCE_TYPE_LABELS: Record<string, string> = {
  justified_paid: "Justificada remunerada",
  justified_unpaid: "Justificada não remunerada",
  unjustified: "Injustificada",
};

const ABSENCE_STATES: Record<string, HrEmployeeState> = {
  pending: { status: "pending", label: "Por rever" },
  validated: { status: "approved", label: "Validada" },
  rejected: { status: "rejected", label: "Rejeitada" },
  cancelled: { status: "cancelled", label: "Cancelada" },
};

export function absenceState(status: string): HrEmployeeState {
  return ABSENCE_STATES[status] ?? { status: "pending", label: status || "—" };
}

const PAYROLL_STATES: Record<string, HrEmployeeState> = {
  draft: { status: "draft", label: "Rascunho" },
  calculating: { status: "processing", label: "Em cálculo" },
  review: { status: "pending", label: "Em revisão" },
  approved: { status: "approved", label: "Aprovada" },
  processing: { status: "processing", label: "Em pagamento" },
  paid: { status: "paid", label: "Paga" },
  cancelled: { status: "cancelled", label: "Anulada" },
};

export function payrollState(status: string): HrEmployeeState {
  return PAYROLL_STATES[status] ?? { status: "pending", label: status || "—" };
}

export type HrEmployeeListRow = {
  id: string;
  personName: string;
  employeeNumber: string | null;
  position: string | null;
  department: string | null;
  employmentType: string;
  status: string;
  hireDate: string | null;
};

export type HrEmployeeContract = {
  id: string;
  number: string | null;
  type: string;
  salaryType: string;
  baseSalaryKz: number;
  hourlyRateKz: number | null;
  lessonHourRateKz: number | null;
  startsOn: string | null;
  endsOn: string | null;
  status: string;
};

export type HrEmployeeAbsence = {
  id: string;
  date: string;
  type: string;
  durationMinutes: number;
  reason: string | null;
  validationStatus: string;
};

export type HrEmployeePayslip = {
  id: string;
  payrollRunId: string;
  competenceYear: number | null;
  competenceMonth: number | null;
  runStatus: string;
  grossKz: number;
  deductionsKz: number;
  netKz: number;
};

export type HrEmployeeDetail = {
  id: string;
  schoolId: string;
  personName: string;
  employeeNumber: string | null;
  position: string | null;
  department: string | null;
  employmentType: string;
  status: string;
  hireDate: string | null;
  terminationDate: string | null;
  weeklyHours: number | null;
  workLocation: string | null;
  /** O registo de professor da mesma pessoa, na mesma escola. */
  teacherId: string | null;
  contracts: HrEmployeeContract[];
  absences: HrEmployeeAbsence[];
  payslips: HrEmployeePayslip[];
};

type Row = Record<string, unknown>;

const text = (value: unknown) => (value == null || value === "" ? null : String(value));
const amount = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const optionalAmount = (value: unknown) => (value == null ? null : amount(value));

/** Contratos do mais recente para o mais antigo. */
export function mapContracts(rows: Row[]): HrEmployeeContract[] {
  return rows
    .map((row) => ({
      id: String(row.id),
      number: text(row.contract_number),
      type: String(row.contract_type ?? ""),
      salaryType: String(row.salary_type ?? ""),
      baseSalaryKz: amount(row.base_salary_kz),
      hourlyRateKz: optionalAmount(row.hourly_rate_kz),
      lessonHourRateKz: optionalAmount(row.lesson_hour_rate_kz),
      startsOn: text(row.starts_on),
      endsOn: text(row.ends_on),
      status: String(row.status ?? ""),
    }))
    .sort((a, b) => (b.startsOn ?? "").localeCompare(a.startsOn ?? ""));
}

export function mapAbsences(rows: Row[]): HrEmployeeAbsence[] {
  return rows
    .map((row) => ({
      id: String(row.id),
      date: String(row.absence_date ?? ""),
      type: String(row.absence_type ?? ""),
      durationMinutes: amount(row.duration_minutes),
      reason: text(row.reason),
      validationStatus: String(row.validation_status ?? ""),
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** Um recibo por folha, da competência mais recente para a mais antiga. */
export function mapPayslips(items: Row[], runs: Row[]): HrEmployeePayslip[] {
  const runById = new Map(runs.map((run) => [String(run.id), run]));
  return items
    .map((item) => {
      const run = runById.get(String(item.payroll_run_id));
      return {
        id: String(item.id),
        payrollRunId: String(item.payroll_run_id),
        competenceYear: run?.competence_year == null ? null : Number(run.competence_year),
        competenceMonth: run?.competence_month == null ? null : Number(run.competence_month),
        runStatus: String(run?.status ?? ""),
        grossKz: amount(item.gross_amount_kz),
        deductionsKz: amount(item.deductions_kz),
        netKz: amount(item.net_amount_kz),
      };
    })
    .sort(
      (a, b) =>
        (b.competenceYear ?? 0) - (a.competenceYear ?? 0) ||
        (b.competenceMonth ?? 0) - (a.competenceMonth ?? 0),
    );
}

/** Minutos em texto curto: «1 dia» (8 h), «3 h», «45 min». */
export function absenceDurationLabel(minutes: number, workdayMinutes = 480): string {
  if (minutes >= workdayMinutes && minutes % workdayMinutes === 0) {
    const days = minutes / workdayMinutes;
    return days === 1 ? "1 dia" : `${days} dias`;
  }
  if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60} h`;
  if (minutes > 60) return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
  return `${minutes} min`;
}

const MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export function competenceLabel(year: number | null, month: number | null): string {
  if (!year || !month || month < 1 || month > 12) return "—";
  return `${MONTHS[month - 1]} de ${year}`;
}
