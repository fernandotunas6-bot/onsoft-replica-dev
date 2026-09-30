import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  canConfirmPaymentItem,
  hrPaymentBatchStatusSchema,
  hrPayrollItemStatusSchema,
  canTransitionPaymentBatch,
  canTransitionPayrollRun,
  compensationValidationFromAssurance,
  confirmPayrollPaymentItemInputSchema,
  createPayrollRunInputSchema,
  createTeacherLessonQrInputSchema,
  isPayrollFinanciallyLocked,
  maskPaymentDestinationLabel,
  materializeTeacherLessonsInputSchema,
  redeemTeacherLessonQrInputSchema,
  reviewHrAbsenceInputSchema,
  upsertHrPaymentDestinationInputSchema,
} from "@/features/hr/schemas";

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("HR schemas — máquina de estados", () => {
  it("locks payroll finances after approval", () => {
    expect(isPayrollFinanciallyLocked("draft")).toBe(false);
    expect(isPayrollFinanciallyLocked("review")).toBe(false);
    expect(isPayrollFinanciallyLocked("approved")).toBe(true);
    expect(isPayrollFinanciallyLocked("processing")).toBe(true);
    expect(isPayrollFinanciallyLocked("paid")).toBe(true);
  });

  it("allows the operational payroll path draft→…→paid", () => {
    expect(canTransitionPayrollRun("draft", "calculating")).toBe(true);
    expect(canTransitionPayrollRun("calculating", "review")).toBe(true);
    expect(canTransitionPayrollRun("review", "approved")).toBe(true);
    expect(canTransitionPayrollRun("approved", "processing")).toBe(true);
    expect(canTransitionPayrollRun("processing", "paid")).toBe(true);
    expect(canTransitionPayrollRun("paid", "draft")).toBe(false);
    expect(canTransitionPayrollRun("approved", "draft")).toBe(false);
  });

  it("allows payment batch dual-control path", () => {
    expect(canTransitionPaymentBatch("draft", "awaiting_authorization")).toBe(true);
    expect(canTransitionPaymentBatch("awaiting_authorization", "authorized")).toBe(true);
    expect(canTransitionPaymentBatch("authorized", "processing")).toBe(true);
    expect(canTransitionPaymentBatch("processing", "partial")).toBe(true);
    expect(canTransitionPaymentBatch("partial", "completed")).toBe(true);
    expect(canTransitionPaymentBatch("completed", "draft")).toBe(false);
  });

  it("accepts database payment states and rejects the obsolete ready state", () => {
    expect(hrPaymentBatchStatusSchema.safeParse("awaiting_authorization").success).toBe(true);
    expect(hrPaymentBatchStatusSchema.safeParse("failed").success).toBe(true);
    expect(hrPaymentBatchStatusSchema.safeParse("ready").success).toBe(false);
    expect(hrPayrollItemStatusSchema.safeParse("processing").success).toBe(true);
    expect(canTransitionPaymentBatch("authorized", "completed")).toBe(true);
  });

  it("only confirms payment items in authorized/processing/failed", () => {
    expect(canConfirmPaymentItem("authorized")).toBe(true);
    expect(canConfirmPaymentItem("processing")).toBe(true);
    expect(canConfirmPaymentItem("failed")).toBe(true);
    expect(canConfirmPaymentItem("paid")).toBe(false);
    expect(canConfirmPaymentItem("blocked")).toBe(false);
    expect(canConfirmPaymentItem("pending")).toBe(false);
  });

  it("maps assurance decisions to compensation validation", () => {
    expect(compensationValidationFromAssurance("auto_approve")).toBe("validated");
    expect(compensationValidationFromAssurance("review")).toBe("pending");
    expect(compensationValidationFromAssurance("reject")).toBe("pending");
    expect(compensationValidationFromAssurance(null)).toBe("pending");
  });
});

describe("HR schemas — inputs Zod", () => {
  it("accepts a valid payroll competence", () => {
    expect(createPayrollRunInputSchema.parse({ year: 2026, month: 9 })).toEqual({
      year: 2026,
      month: 9,
      notes: "",
    });
  });

  it("rejects invalid payroll months", () => {
    expect(() => createPayrollRunInputSchema.parse({ year: 2026, month: 13 })).toThrow();
  });

  it("requires destination details for bank transfers", () => {
    expect(() =>
      upsertHrPaymentDestinationInputSchema.parse({
        employmentId: "11111111-1111-4111-8111-111111111111",
        method: "transfer",
        beneficiaryName: "Maria Silva",
      }),
    ).toThrow(/IBAN|conta|referência/i);
  });

  it("requires failure reason when marking payment failed", () => {
    expect(() =>
      confirmPayrollPaymentItemInputSchema.parse({
        paymentItemId: "11111111-1111-4111-8111-111111111111",
        result: "failed",
        reference: "REF-1",
        failureReason: "",
      }),
    ).toThrow(/motivo/i);
  });

  it("validates absence review and QR payloads", () => {
    expect(
      reviewHrAbsenceInputSchema.parse({
        absenceId: "11111111-1111-4111-8111-111111111111",
        absenceType: "unjustified",
        decision: "validate",
        reason: "Sem justificação apresentada",
      }).decision,
    ).toBe("validate");

    expect(
      createTeacherLessonQrInputSchema.parse({
        occurrenceId: "11111111-1111-4111-8111-111111111111",
        purpose: "check_in",
      }).purpose,
    ).toBe("check_in");

    expect(() =>
      redeemTeacherLessonQrInputSchema.parse({
        token: "x".repeat(40),
        latitude: -8.8,
        longitude: null,
      }),
    ).toThrow(/Localização incompleta/);
  });

  it("caps materialize window at 31 days", () => {
    expect(() =>
      materializeTeacherLessonsInputSchema.parse({
        from: "2026-01-01",
        to: "2026-03-01",
      }),
    ).toThrow(/31 dias/);
  });

  it("masks payment destinations for UI", () => {
    expect(maskPaymentDestinationLabel("AO06004400006729503010102", null, null, "transfer")).toBe(
      "IBAN ••••0102",
    );
    expect(maskPaymentDestinationLabel(null, null, null, "cash")).toBe("Numerário");
  });
});

describe("HR schemas — wiring nos server fns", () => {
  it("payroll/payments/absences importam schemas centrais", () => {
    expect(source("src/features/hr/payroll.ts")).toContain('from "@/features/hr/schemas"');
    expect(source("src/features/hr/payments.ts")).toContain("confirmPayrollPaymentItemInputSchema");
    expect(source("src/features/hr/payments.ts")).toContain(
      'rpc("hr_confirm_payroll_payment_item"',
    );
    expect(source("src/features/hr/absences.ts")).toContain("reviewHrAbsenceInputSchema");
    expect(source("src/features/hr/teacher-lessons.ts")).toContain(
      "createTeacherLessonQrInputSchema",
    );
    expect(source("src/features/hr/teacher-lesson-exceptions.ts")).toContain(
      "teacherAttendancePolicyInputSchema",
    );
    expect(source("src/features/hr/attendance-assurance.ts")).toContain(
      "attendanceAssurancePolicySchema",
    );
    expect(source("src/features/hr/materialize-lessons.ts")).toContain(
      "materializeTeacherLessonsInputSchema",
    );
  });

  it("modules.json regista schemas.ts no inventário rh", () => {
    const catalog = JSON.parse(source("scripts/siga/modules.json"));
    const rh = catalog.modules.find((m: { id: string }) => m.id === "rh");
    expect(rh.feature).toContain("src/features/hr/schemas.ts");
  });

  it("QR check-in faz handoff para chamada de alunos", () => {
    const lessons = source("src/features/hr/teacher-lessons.ts");
    expect(lessons).toContain("resolveAuthenticatedTeacherId");
    expect(lessons).toContain("ensureAttendanceSessionForOccurrence");
    expect(lessons).toContain("siga_attendance_sessions");
    expect(lessons).toContain("classroom");
    expect(lessons).toContain("openMyLessonClassroom");
    expect(lessons).toContain("enrichOccurrencesWithClassroom");
    expect(lessons).toContain("class_group_name");

    const panel = source("src/features/hr/TeacherAttendancePanel.tsx");
    expect(panel).toContain("AttendanceCallDialog");
    expect(panel).toContain("openClassroomCall");
    expect(panel).toContain("result.classroom");
    expect(panel).toContain("check_out");
    expect(panel).toContain("Abrir chamada");
    expect(panel).toContain("Lançar notas");
    expect(panel).toContain("teacherGradesSearch");
    expect(panel).toContain("teacherLessonPlansSearch");
    expect(panel).toContain("teacherClassFilesSearch");

    const route = source("src/routes/professor.presenca.tsx");
    expect(route).toContain("chamada");
    expect(route).toContain("TeacherAttendancePanel");

    const portal = source("src/features/dashboard/portals/TeacherPortalDashboard.tsx");
    expect(portal).toContain("/professor/presenca");
    expect(portal).toContain("Assinar presença");
    expect(portal).toContain("Lançar notas desta aula");
    expect(portal).toContain("teacherLessonPlansSearch");

    const callDialog = source("src/features/pedagogica/components/AttendanceCallDialog.tsx");
    expect(callDialog).toContain("Lançar notas");
    expect(callDialog).toContain("teacherLessonPlansSearch");
    expect(callDialog).toContain("Materiais");

    const links = source("src/features/hr/teacher-classroom-links.ts");
    expect(links).toContain("teacherGradesSearch");
    expect(links).toContain("teacherLessonPlansSearch");
    expect(links).toContain("teacherClassFilesSearch");

    const planos = source("src/routes/planos-aula.tsx");
    expect(planos).toContain("planosSearchSchema");
    expect(planos).toContain("search.turma");
  });
});
