import { z } from "zod";

/** Papéis com escrita operacional de RH / folha / ordens salariais. */
export const HR_ADMIN_ROLES = ["Administrador", "Tesouraria"] as const;
export type HrAdminRole = (typeof HR_ADMIN_ROLES)[number];

// ─── Domínio: enums canónicos (espelham CHECK constraints SQL) ───────────────

export const hrEmploymentStatusSchema = z.enum([
  "draft",
  "active",
  "suspended",
  "terminated",
]);
export type HrEmploymentStatus = z.infer<typeof hrEmploymentStatusSchema>;

export const hrSalaryTypeSchema = z.enum(["monthly", "hourly", "lesson_hour"]);
export type HrSalaryType = z.infer<typeof hrSalaryTypeSchema>;

export const hrRemunerationModelSchema = z.enum([
  "fixed_deduct_absence",
  "validated_units",
  "hybrid",
]);
export type HrRemunerationModel = z.infer<typeof hrRemunerationModelSchema>;

export const hrAbsenceTypeSchema = z.enum([
  "justified_paid",
  "justified_unpaid",
  "unjustified",
]);
export type HrAbsenceType = z.infer<typeof hrAbsenceTypeSchema>;

export const hrValidationStatusSchema = z.enum([
  "pending",
  "validated",
  "rejected",
  "cancelled",
]);
export type HrValidationStatus = z.infer<typeof hrValidationStatusSchema>;

export const hrPayrollRunStatusSchema = z.enum([
  "draft",
  "calculating",
  "review",
  "approved",
  "processing",
  "paid",
  "cancelled",
]);
export type HrPayrollRunStatus = z.infer<typeof hrPayrollRunStatusSchema>;

/** Estados em que os valores monetários da folha ficam congelados. */
export const HR_PAYROLL_LOCKED_STATUSES = [
  "approved",
  "processing",
  "paid",
] as const satisfies readonly HrPayrollRunStatus[];

export const hrPayrollItemStatusSchema = z.enum([
  "draft",
  "calculated",
  "approved",
  "paid",
  "cancelled",
]);
export type HrPayrollItemStatus = z.infer<typeof hrPayrollItemStatusSchema>;

export const hrPaymentMethodSchema = z.enum(["transfer", "cash", "other"]);
export type HrPaymentMethod = z.infer<typeof hrPaymentMethodSchema>;

export const hrPaymentBatchStatusSchema = z.enum([
  "draft",
  "ready",
  "authorized",
  "processing",
  "partial",
  "completed",
  "cancelled",
]);
export type HrPaymentBatchStatus = z.infer<typeof hrPaymentBatchStatusSchema>;

export const hrPaymentItemStatusSchema = z.enum([
  "pending",
  "blocked",
  "authorized",
  "processing",
  "paid",
  "failed",
  "cancelled",
]);
export type HrPaymentItemStatus = z.infer<typeof hrPaymentItemStatusSchema>;

export const hrQrPurposeSchema = z.enum(["check_in", "check_out"]);
export type HrQrPurpose = z.infer<typeof hrQrPurposeSchema>;

export const hrAssuranceDecisionSchema = z.enum(["auto_approve", "review", "reject"]);
export type HrAssuranceDecision = z.infer<typeof hrAssuranceDecisionSchema>;

// ─── Máquinas de estado (spec operacional) ───────────────────────────────────

/** Transições permitidas de `hr_payroll_runs.status`. */
export const HR_PAYROLL_RUN_TRANSITIONS: Record<
  HrPayrollRunStatus,
  readonly HrPayrollRunStatus[]
> = {
  draft: ["calculating", "cancelled"],
  calculating: ["review", "draft", "cancelled"],
  review: ["approved", "draft", "cancelled"],
  approved: ["processing", "cancelled"],
  processing: ["paid", "approved"],
  paid: [],
  cancelled: [],
};

/** Transições permitidas de `hr_payroll_payment_batches.status`. */
export const HR_PAYMENT_BATCH_TRANSITIONS: Record<
  HrPaymentBatchStatus,
  readonly HrPaymentBatchStatus[]
> = {
  draft: ["ready", "cancelled"],
  ready: ["authorized", "draft", "cancelled"],
  authorized: ["processing", "cancelled"],
  processing: ["partial", "completed"],
  partial: ["processing", "completed"],
  completed: [],
  cancelled: [],
};

/** Estados a partir dos quais um item de pagamento pode ser confirmado/falhado. */
export const HR_PAYMENT_CONFIRMABLE_STATUSES = [
  "authorized",
  "processing",
  "failed",
] as const satisfies readonly HrPaymentItemStatus[];

export function canTransitionPayrollRun(
  from: HrPayrollRunStatus,
  to: HrPayrollRunStatus,
): boolean {
  return HR_PAYROLL_RUN_TRANSITIONS[from].includes(to);
}

export function canTransitionPaymentBatch(
  from: HrPaymentBatchStatus,
  to: HrPaymentBatchStatus,
): boolean {
  return HR_PAYMENT_BATCH_TRANSITIONS[from].includes(to);
}

export function isPayrollFinanciallyLocked(status: string): boolean {
  return (HR_PAYROLL_LOCKED_STATUSES as readonly string[]).includes(status);
}

export function canConfirmPaymentItem(status: string): boolean {
  return (HR_PAYMENT_CONFIRMABLE_STATUSES as readonly string[]).includes(status);
}

/**
 * Compensação de aula só deve entrar no cálculo da folha quando a decisão
 * de assurance do check-out é `auto_approve`.
 */
export function compensationValidationFromAssurance(
  decision: HrAssuranceDecision | null | undefined,
): "validated" | "pending" {
  return decision === "auto_approve" ? "validated" : "pending";
}

// ─── Inputs de server actions ────────────────────────────────────────────────

export const createPayrollRunInputSchema = z.object({
  year: z.number().int().min(2000).max(2200),
  month: z.number().int().min(1).max(12),
  notes: z.string().trim().max(1000).optional().default(""),
});
export type CreatePayrollRunInput = z.infer<typeof createPayrollRunInputSchema>;

export const payrollRunIdInputSchema = z.object({
  payrollRunId: z.string().uuid(),
});
export type PayrollRunIdInput = z.infer<typeof payrollRunIdInputSchema>;

export const paymentBatchIdInputSchema = z.object({
  batchId: z.string().uuid(),
});
export type PaymentBatchIdInput = z.infer<typeof paymentBatchIdInputSchema>;

export const reviewHrAbsenceInputSchema = z.object({
  absenceId: z.string().uuid(),
  absenceType: hrAbsenceTypeSchema,
  decision: z.enum(["validate", "reject"]),
  reason: z.string().trim().min(3).max(1000),
});
export type ReviewHrAbsenceInput = z.infer<typeof reviewHrAbsenceInputSchema>;

export const upsertHrPaymentDestinationInputSchema = z
  .object({
    employmentId: z.string().uuid(),
    method: hrPaymentMethodSchema,
    beneficiaryName: z.string().trim().min(2).max(160),
    bankName: z.string().trim().max(160).optional().default(""),
    iban: z.string().trim().max(64).optional().default(""),
    accountNumber: z.string().trim().max(80).optional().default(""),
    destinationReference: z.string().trim().max(160).optional().default(""),
  })
  .superRefine((value, ctx) => {
    if (
      value.method === "transfer" &&
      !value.iban &&
      !value.accountNumber &&
      !value.destinationReference
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["iban"],
        message: "Indique IBAN, número de conta ou referência segura.",
      });
    }
  });
export type UpsertHrPaymentDestinationInput = z.infer<
  typeof upsertHrPaymentDestinationInputSchema
>;

export const confirmPayrollPaymentItemInputSchema = z
  .object({
    paymentItemId: z.string().uuid(),
    result: z.enum(["paid", "failed"]),
    reference: z.string().trim().min(3).max(160),
    failureReason: z.string().trim().max(500).optional().default(""),
  })
  .superRefine((value, ctx) => {
    if (value.result === "failed" && value.failureReason.length < 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["failureReason"],
        message: "Indique o motivo da falha.",
      });
    }
  });
export type ConfirmPayrollPaymentItemInput = z.infer<
  typeof confirmPayrollPaymentItemInputSchema
>;

export const attendanceAssurancePolicySchema = z
  .object({
    enabled: z.boolean().default(true),
    centerLatitude: z.number().min(-90).max(90).nullable(),
    centerLongitude: z.number().min(-180).max(180).nullable(),
    geofenceRadiusM: z.number().int().min(20).max(5000),
    maxLocationAccuracyM: z.number().int().min(10).max(5000),
    requireLocation: z.boolean(),
    storeExactLocation: z.boolean(),
    checkinEarlyMinutes: z.number().int().min(0).max(180),
    checkinLateMinutes: z.number().int().min(0).max(180),
    checkoutEarlyMinutes: z.number().int().min(0).max(180),
    checkoutLateMinutes: z.number().int().min(0).max(360),
    autoApproveScore: z.number().int().min(0).max(100),
    reviewScore: z.number().int().min(0).max(100),
  })
  .superRefine((value, ctx) => {
    if ((value.centerLatitude == null) !== (value.centerLongitude == null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["centerLatitude"],
        message: "Latitude e longitude devem ser definidas em conjunto.",
      });
    }
    if (value.autoApproveScore < value.reviewScore) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["autoApproveScore"],
        message: "A aprovação automática deve ser igual ou superior ao limiar de revisão.",
      });
    }
  });
export type AttendanceAssurancePolicyInput = z.infer<typeof attendanceAssurancePolicySchema>;

export const DEFAULT_ATTENDANCE_ASSURANCE_POLICY: AttendanceAssurancePolicyInput = {
  enabled: true,
  centerLatitude: null,
  centerLongitude: null,
  geofenceRadiusM: 150,
  maxLocationAccuracyM: 100,
  requireLocation: false,
  storeExactLocation: false,
  checkinEarlyMinutes: 20,
  checkinLateMinutes: 20,
  checkoutEarlyMinutes: 20,
  checkoutLateMinutes: 60,
  autoApproveScore: 70,
  reviewScore: 45,
};

export const createTeacherLessonQrInputSchema = z.object({
  occurrenceId: z.string().uuid(),
  purpose: hrQrPurposeSchema,
});
export type CreateTeacherLessonQrInput = z.infer<typeof createTeacherLessonQrInputSchema>;

export const redeemTeacherLessonQrInputSchema = z
  .object({
    token: z.string().trim().min(32).max(256),
    latitude: z.number().min(-90).max(90).nullable().optional().default(null),
    longitude: z.number().min(-180).max(180).nullable().optional().default(null),
    /** Precisão GPS em metros (GeolocationCoordinates.accuracy). */
    accuracy: z.number().min(0).max(10_000).nullable().optional().default(null),
  })
  .superRefine((value, ctx) => {
    if ((value.latitude == null) !== (value.longitude == null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["latitude"],
        message: "Localização incompleta.",
      });
    }
  });
export type RedeemTeacherLessonQrInput = z.infer<typeof redeemTeacherLessonQrInputSchema>;

export const materializeTeacherLessonsInputSchema = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inicial inválida."),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data final inválida."),
  })
  .superRefine((value, ctx) => {
    const start = Date.parse(`${value.from}T00:00:00Z`);
    const end = Date.parse(`${value.to}T00:00:00Z`);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["to"],
        message: "Intervalo de sincronização inválido.",
      });
    } else if (end - start > 31 * 86_400_000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["to"],
        message: "A sincronização não pode exceder 31 dias.",
      });
    }
  });
export type MaterializeTeacherLessonsInput = z.infer<typeof materializeTeacherLessonsInputSchema>;

export const assignTeacherSubstituteInputSchema = z.object({
  occurrenceId: z.string().uuid(),
  substituteTeacherId: z.string().uuid(),
  reason: z.string().trim().min(3).max(1000),
});
export type AssignTeacherSubstituteInput = z.infer<typeof assignTeacherSubstituteInputSchema>;

export const createExtraTeacherLessonInputSchema = z
  .object({
    classSubjectId: z.string().uuid(),
    lessonDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data da aula inválida."),
    startsAt: z.string().regex(/^\d{2}:\d{2}$/, "Hora inicial inválida."),
    endsAt: z.string().regex(/^\d{2}:\d{2}$/, "Hora final inválida."),
    reason: z.string().trim().min(3).max(1000),
  })
  .superRefine((value, ctx) => {
    if (value.endsAt <= value.startsAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endsAt"],
        message: "A hora final deve ser posterior à hora inicial.",
      });
    }
  });
export type CreateExtraTeacherLessonInput = z.infer<typeof createExtraTeacherLessonInputSchema>;

export const occurrenceIdInputSchema = z.object({
  occurrenceId: z.string().uuid(),
});
export type OccurrenceIdInput = z.infer<typeof occurrenceIdInputSchema>;

export const teacherAttendancePolicyInputSchema = z.object({
  name: z.string().trim().min(1).max(120).default("Política padrão"),
  lateGraceMinutes: z.number().int().min(0).max(120),
  earlyLeaveGraceMinutes: z.number().int().min(0).max(120),
  minimumAttendancePercent: z.number().min(0).max(100),
  outsideGraceMode: z.enum(["review", "proportional"]),
});
export type TeacherAttendancePolicyInput = z.infer<typeof teacherAttendancePolicyInputSchema>;

/** Máscara de IBAN/conta para UI — nunca devolver o valor completo nas listagens. */
export function maskPaymentDestinationLabel(
  iban: string | null | undefined,
  accountNumber: string | null | undefined,
  destinationReference: string | null | undefined,
  method: string,
): string {
  const source = (iban || accountNumber || "").replace(/\s/g, "");
  if (source.length >= 4) {
    return `${iban ? "IBAN" : "Conta"} ••••${source.slice(-4)}`;
  }
  if (destinationReference) return destinationReference;
  if (method === "cash") return "Numerário";
  return "Outro";
}
