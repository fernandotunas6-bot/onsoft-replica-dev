import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  canConfirmPaymentItem,
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
    expect(canTransitionPaymentBatch("draft", "ready")).toBe(true);
    expect(canTransitionPaymentBatch("ready", "authorized")).toBe(true);
    expect(canTransitionPaymentBatch("authorized", "processing")).toBe(true);
    expect(canTransitionPaymentBatch("processing", "partial")).toBe(true);
    expect(canTransitionPaymentBatch("partial", "completed")).toBe(true);
    expect(canTransitionPaymentBatch("completed", "draft")).toBe(false);
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
    expect(source("src/features/hr/payments.ts")).toContain("canConfirmPaymentItem");
    expect(source("src/features/hr/payments.ts")).toContain("HR_PAYMENT_CONFIRMABLE_STATUSES");
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
});
