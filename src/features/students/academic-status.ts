import { schoolTodayIso } from "@/lib/school-date";
/**
 * academic-status.ts
 *
 * Motor de domínio canónico para estados académicos, estados financeiros e
 * contadores do SIGA Plus.
 *
 * Regras fundamentais:
 * 1. O estado académico é derivado primariamente da matrícula (enrollments) e do
 *    vínculo institucional (students).
 * 2. O estado financeiro ("Com dívida", "Regularizado", etc.) é um indicador
 *    COMPLEMENTAR derivado das faturas e recibos reais, nunca exclusivo do
 *    estado académico. Um aluno pode ser simultaneamente "Activo" e "Com dívida".
 * 3. Candidato com matrícula activa passa a "Activo", preservando o histórico da candidatura.
 * 4. Transferências internas mantêm o aluno "Activo". Apenas transferências
 *    externas para outra instituição marcam o vínculo institucional como transferido.
 */

export type AcademicStatus =
  | "active"
  | "applicant"
  | "inactive"
  | "transferred"
  | "graduated"
  | "cancelled"
  | "suspended"
  | "locked";

export type FinancialStatus = "settled" | "pending" | "overdue" | "partial";

export type QuickFilterCategory = "todos" | "activos" | "candidatos" | "divida" | "inactivos";

export type InactiveSubFilter =
  "todos" | "transferred" | "inactive" | "graduated" | "cancelled" | "suspended" | "locked";

export type CandidateSubFilter =
  "todos" | "waiting_class" | "pending_application" | "approved" | "converted";

export interface StudentFinancialSummary {
  paymentStatus: FinancialStatus | null;
  totalBilled: number;
  totalPaid: number;
  remainingBalance: number;
  debtAmount: number;
  overdueCount: number;
  hasDebt: boolean;
}

export interface StudentEnrollmentLike {
  id?: string | null;
  status?: string | null;
  class_group_id?: string | null;
  class_name?: string | null;
  academic_year_id?: string | null;
  academic_year?: string | null;
}

export interface InvoiceLike {
  id: string;
  total_amount?: number | null;
  amount?: number | null;
  discount_amount?: number | null;
  /** Multa por atraso já aplicada (entra no total a pagar). */
  penalty_amount?: number | null;
  amount_paid?: number | null;
  due_date?: string | null;
  due_on?: string | null;
  status?: string | null;
}

export interface ReceiptLike {
  invoice_id: string;
  amount: number;
  status?: string | null;
}

export interface UnifiedStudentStatus {
  academicStatus: AcademicStatus;
  academicLabel: string;
  isEnrolled: boolean;
  hasClassGroup: boolean;
  financial: StudentFinancialSummary;
  displaySummary: string;
}

export const ACADEMIC_STATUS_LABELS: Record<AcademicStatus, string> = {
  active: "Activo",
  applicant: "Candidato",
  inactive: "Desistente",
  transferred: "Transferido",
  graduated: "Concluído",
  cancelled: "Matrícula Anulada",
  suspended: "Suspenso",
  locked: "Trancado",
};

/** Rótulo do estado do aluno — o mesmo no distintivo, nos filtros, na ficha e nas exportações. */
export function academicStatusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return ACADEMIC_STATUS_LABELS[status as AcademicStatus] ?? status;
}

/** Estados que a secretaria escolhe à mão (ficha, lista e lote). */
export const MANUAL_STUDENT_STATUSES = ["active", "inactive", "transferred", "graduated"] as const;
export type ManualStudentStatus = (typeof MANUAL_STUDENT_STATUSES)[number];

/** Opções `{ value, label }` para os formulários de mudança de estado. */
export function studentStatusChoices(extra: AcademicStatus[] = []) {
  return [...MANUAL_STUDENT_STATUSES, ...extra].map((value) => ({
    value,
    label: ACADEMIC_STATUS_LABELS[value],
  }));
}

export const ENROLLMENT_STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  active: "Activa",
  transferred: "Transferida",
  completed: "Concluída",
  cancelled: "Anulada",
};

export function enrollmentStatusLabel(status: string | null | undefined): string {
  if (!status) return "Sem matrícula";
  return ENROLLMENT_STATUS_LABELS[status] ?? status;
}

export const FINANCIAL_STATUS_LABELS: Record<FinancialStatus, string> = {
  settled: "Regularizado",
  pending: "Pendente",
  overdue: "Com dívida",
  partial: "Pagamento parcial",
};

/**
 * Deriva o estado académico real a partir dos registos de student e enrollment.
 */
export function deriveAcademicStatus(input: {
  studentStatus?: string | null;
  enrollmentStatus?: string | null;
  hasClassGroup?: boolean;
}): AcademicStatus {
  const sStatus = (input.studentStatus ?? "active").toLowerCase().trim();
  const eStatus = (input.enrollmentStatus ?? "").toLowerCase().trim();

  // 1. Estados terminais explícitos do aluno têm precedência
  if (sStatus === "transferred") return "transferred";
  if (sStatus === "graduated") return "graduated";
  if (sStatus === "inactive" || sStatus === "withdrawn" || sStatus === "dropped") return "inactive";
  if (sStatus === "suspended") return "suspended";
  if (sStatus === "locked") return "locked";

  // 2. Matrícula cancelada ou anulada
  if (eStatus === "cancelled" || eStatus === "void" || eStatus === "withdrawn") {
    return "cancelled";
  }

  // 3. Matrícula activa coloca o aluno como activo, mesmo que o registo
  //    em students ainda conste como "applicant" por legado ou seed
  if (eStatus === "active") {
    return "active";
  }

  // 4. Se o aluno foi marcado como candidato ou não tem turma
  if (sStatus === "applicant") {
    return "applicant";
  }

  // 5. Se tem turma atribuída mas matrícula pending, é activo em curso
  if (input.hasClassGroup && (eStatus === "pending" || !eStatus)) {
    return "active";
  }

  // 6. Aluno sem turma e sem matrícula activa é candidato/aguardando turma
  if (!input.hasClassGroup && !eStatus && sStatus === "active") {
    return "applicant";
  }

  return (sStatus as AcademicStatus) || "active";
}

/**
 * Calcula o resumo financeiro de um estudante a partir das suas faturas e recibos.
 */
export function deriveFinancialSnapshot(
  invoices: InvoiceLike[],
  today = schoolTodayIso(),
): StudentFinancialSummary {
  if (!invoices.length) {
    return {
      paymentStatus: null,
      totalBilled: 0,
      totalPaid: 0,
      remainingBalance: 0,
      debtAmount: 0,
      overdueCount: 0,
      hasDebt: false,
    };
  }

  let totalBilled = 0;
  let totalPaid = 0;
  let debtAmount = 0;
  let overdueCount = 0;

  for (const inv of invoices) {
    const rawStatus = (inv.status ?? "issued").toLowerCase();
    if (rawStatus === "cancelled" || rawStatus === "void") continue;

    const total =
      inv.total_amount != null
        ? Number(inv.total_amount)
        : Math.max(
            0,
            Number(inv.amount ?? 0) -
              Number(inv.discount_amount ?? 0) +
              Number(inv.penalty_amount ?? 0),
          );

    const paid = Math.min(total, Math.max(0, Number(inv.amount_paid ?? 0)));
    const openAmount = Math.max(0, total - paid);
    const dueDate = inv.due_date || inv.due_on;

    totalBilled += total;
    totalPaid += paid;

    if (openAmount > 0) {
      if (dueDate && dueDate < today) {
        overdueCount += 1;
        debtAmount += openAmount;
      }
    }
  }

  const remainingBalance = Math.max(0, totalBilled - totalPaid);
  const hasDebt = overdueCount > 0 && debtAmount > 0;

  let paymentStatus: FinancialStatus | null = null;
  if (totalBilled > 0) {
    if (hasDebt) {
      paymentStatus = "overdue";
    } else if (remainingBalance > 0) {
      paymentStatus = totalPaid > 0 ? "partial" : "pending";
    } else {
      paymentStatus = "settled";
    }
  }

  return {
    paymentStatus,
    totalBilled,
    totalPaid,
    remainingBalance,
    debtAmount,
    overdueCount,
    hasDebt,
  };
}

/**
 * Classifica se um estudante corresponde a uma categoria principal da barra superior.
 */
export function matchesQuickCategory(
  student: {
    student_status: string;
    payment_status?: string | null;
    has_debt?: boolean;
    class_name?: string | null;
  },
  category: QuickFilterCategory,
  inactiveSub?: InactiveSubFilter,
  candidateSub?: CandidateSubFilter,
): boolean {
  const status = student.student_status as AcademicStatus;
  const isDebt = Boolean(student.has_debt || student.payment_status === "overdue");

  switch (category) {
    case "todos":
      return true;

    case "activos":
      return status === "active";

    case "candidatos":
      if (status !== "applicant") return false;
      if (candidateSub === "waiting_class") return !student.class_name;
      return true;

    case "divida":
      return isDebt;

    case "inactivos": {
      const isInactiveType = [
        "inactive",
        "transferred",
        "graduated",
        "cancelled",
        "suspended",
        "locked",
      ].includes(status);
      if (!isInactiveType) return false;
      if (!inactiveSub || inactiveSub === "todos") return true;
      return status === inactiveSub;
    }
  }
}

/**
 * Calcula os contadores dinâmicos exatos para a barra de filtros premium.
 */
export function computeDynamicCounters<
  T extends {
    student_status: string;
    payment_status?: string | null;
    has_debt?: boolean;
    class_name?: string | null;
  },
>(
  students: T[],
  extraPendingApplicationsCount = 0,
): {
  all: number;
  active: number;
  applicant: number;
  overdue: number;
  other: number;
  inactivesDetail: {
    transferred: number;
    inactive: number;
    graduated: number;
    cancelled: number;
    suspended: number;
    locked: number;
  };
} {
  let active = 0;
  let applicant = 0;
  let overdue = 0;
  let other = 0;

  const inactivesDetail = {
    transferred: 0,
    inactive: 0,
    graduated: 0,
    cancelled: 0,
    suspended: 0,
    locked: 0,
  };

  for (const s of students) {
    const status = s.student_status as AcademicStatus;
    const isDebt = Boolean(s.has_debt || s.payment_status === "overdue");

    if (status === "active") active += 1;
    else if (status === "applicant") applicant += 1;
    else {
      other += 1;
      if (status === "transferred") inactivesDetail.transferred += 1;
      else if (status === "inactive") inactivesDetail.inactive += 1;
      else if (status === "graduated") inactivesDetail.graduated += 1;
      else if (status === "cancelled") inactivesDetail.cancelled += 1;
      else if (status === "suspended") inactivesDetail.suspended += 1;
      else if (status === "locked") inactivesDetail.locked += 1;
    }

    if (isDebt) overdue += 1;
  }

  // Candidaturas pendentes submetidas no portal público que ainda aguardam admissão
  applicant += extraPendingApplicationsCount;

  return {
    all: students.length + extraPendingApplicationsCount,
    active,
    applicant,
    overdue,
    other,
    inactivesDetail,
  };
}

/**
 * Formata um valor monetário em Kz no padrão angolano.
 */
export function formatKz(amount: number): string {
  return `${amount.toLocaleString("pt-AO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} Kz`;
}
