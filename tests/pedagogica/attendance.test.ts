import { describe, it, expect } from "vitest";
import {
  attendanceStatusEnum,
  computeAttendanceRate,
  submitAttendanceCallBatchInputSchema,
  editFinalizedAttendanceCallInputSchema,
  submitAttendanceJustificationInputSchema,
  reviewAttendanceJustificationInputSchema,
  getStudentAttendanceHistoryInputSchema,
  listTeacherAttendanceSessionsInputSchema,
  getAttendanceCallSheetInputSchema,
} from "@/features/pedagogica/attendance-server";

const uuid = "123e4567-e89b-12d3-a456-426614174000";

describe("Attendance Module Schemas & Validations", () => {
  it("validates attendance status enum values", () => {
    expect(attendanceStatusEnum.parse("present")).toBe("present");
    expect(attendanceStatusEnum.parse("absent")).toBe("absent");
    expect(attendanceStatusEnum.parse("excused")).toBe("excused");
    expect(attendanceStatusEnum.parse("late")).toBe("late");
    expect(attendanceStatusEnum.parse("early_exit")).toBe("early_exit");
    expect(attendanceStatusEnum.parse("not_registered")).toBe("not_registered");

    expect(() => attendanceStatusEnum.parse("invalid_status")).toThrow();
  });

  it("validates attendance call batch submission input", () => {
    const validBatch = {
      sessionId: "123e4567-e89b-12d3-a456-426614174000",
      markAllPresent: true,
      records: [
        {
          studentId: "123e4567-e89b-12d3-a456-426614174001",
          status: "present",
        },
        {
          studentId: "123e4567-e89b-12d3-a456-426614174002",
          status: "absent",
          notes: "Falta sem aviso prévio",
        },
      ],
    };

    const parsed = submitAttendanceCallBatchInputSchema.parse(validBatch);
    expect(parsed.records).toHaveLength(2);
    expect(parsed.markAllPresent).toBe(true);
  });

  it("requires reason of at least 5 characters for editing finalized call", () => {
    const validEdit = {
      sessionId: "123e4567-e89b-12d3-a456-426614174000",
      reason: "Corrigido atraso do aluno por falha de transporte",
      records: [
        {
          studentId: "123e4567-e89b-12d3-a456-426614174001",
          status: "late",
        },
      ],
    };

    expect(editFinalizedAttendanceCallInputSchema.parse(validEdit).reason).toBe(
      "Corrigido atraso do aluno por falha de transporte",
    );

    const invalidEdit = {
      ...validEdit,
      reason: "Erro",
    };

    expect(() => editFinalizedAttendanceCallInputSchema.parse(invalidEdit)).toThrow();
  });

  it("validates attendance justification submission input", () => {
    const validJustification = {
      studentId: "123e4567-e89b-12d3-a456-426614174001",
      reason: "Ausência por consulta médica agendada",
    };

    const parsed = submitAttendanceJustificationInputSchema.parse(validJustification);
    expect(parsed.studentId).toBe("123e4567-e89b-12d3-a456-426614174001");
    expect(parsed.reason).toBe("Ausência por consulta médica agendada");

    const shortReason = {
      studentId: "123e4567-e89b-12d3-a456-426614174001",
      reason: "Doente",
    };

    expect(() => submitAttendanceJustificationInputSchema.parse(shortReason)).toThrow();
  });
});

describe("reviewAttendanceJustificationInputSchema", () => {
  it("only accepts approved or rejected as the review outcome", () => {
    expect(
      reviewAttendanceJustificationInputSchema.safeParse({
        justificationId: uuid,
        status: "approved",
      }).success,
    ).toBe(true);
    expect(
      reviewAttendanceJustificationInputSchema.safeParse({
        justificationId: uuid,
        status: "pending",
      }).success,
    ).toBe(false);
  });

  it("rejects a non-UUID justification id", () => {
    expect(
      reviewAttendanceJustificationInputSchema.safeParse({
        justificationId: "not-a-uuid",
        status: "approved",
      }).success,
    ).toBe(false);
  });
});

describe("getStudentAttendanceHistoryInputSchema", () => {
  it("allows an empty payload (defaults to the caller's own history)", () => {
    expect(getStudentAttendanceHistoryInputSchema.safeParse({}).success).toBe(true);
  });

  it("rejects a non-UUID studentId when provided", () => {
    expect(getStudentAttendanceHistoryInputSchema.safeParse({ studentId: "abc" }).success).toBe(
      false,
    );
  });
});

describe("listTeacherAttendanceSessionsInputSchema and getAttendanceCallSheetInputSchema", () => {
  it("accept an empty payload — every field is optional", () => {
    expect(listTeacherAttendanceSessionsInputSchema.safeParse({}).success).toBe(true);
    expect(getAttendanceCallSheetInputSchema.safeParse({}).success).toBe(true);
  });

  it("still validate the shape of the fields that are provided", () => {
    expect(
      listTeacherAttendanceSessionsInputSchema.safeParse({ classGroupId: "not-a-uuid" }).success,
    ).toBe(false);
    expect(getAttendanceCallSheetInputSchema.safeParse({ sessionId: "not-a-uuid" }).success).toBe(
      false,
    );
  });
});

describe("computeAttendanceRate", () => {
  it("counts present, excused and late in favour of the attendance rate", () => {
    const rate = computeAttendanceRate([
      { status: "present" },
      { status: "present" },
      { status: "excused" },
      { status: "late" },
      { status: "absent" },
    ]);
    expect(rate).toBe(80);
  });

  it("only penalises unexcused absences", () => {
    const rate = computeAttendanceRate([{ status: "absent" }, { status: "absent" }]);
    expect(rate).toBe(0);
  });

  it("returns null when there are no attendance records yet", () => {
    expect(computeAttendanceRate([])).toBeNull();
  });

  it("rounds to the nearest whole percentage", () => {
    const rate = computeAttendanceRate([
      { status: "present" },
      { status: "present" },
      { status: "absent" },
    ]);
    expect(rate).toBe(67);
  });
});
