import { describe, expect, it } from "vitest";
import { mobileCommandSchema } from "@/features/mobile-v4/schemas";

describe("Mobile server command validation", () => {
  it("rejects invalid marks, revisions and published types", () => {
    const valid = {
      type: "grade",
      classId: "class",
      studentId: "student",
      value: 12,
      published: false,
      expectedRevision: 0,
    };
    expect(mobileCommandSchema.safeParse(valid).success).toBe(true);
    for (const extra of [
      { value: 21 },
      { value: -1 },
      { value: NaN },
      { expectedRevision: 0.5 },
      { expectedRevision: -1 },
      { published: "true" },
    ]) {
      expect(mobileCommandSchema.safeParse({ ...valid, ...extra }).success).toBe(false);
    }
  });
  it("rejects duplicate students and malformed attendance", () => {
    const entry = { studentId: "student", status: "presente" };
    for (const entries of [[], [entry, entry], [{ ...entry, status: "unknown" }]]) {
      expect(
        mobileCommandSchema.safeParse({ type: "attendance", lessonId: "lesson", entries }).success,
      ).toBe(false);
    }
  });
  it("rejects impossible due dates, oversized and blank text", () => {
    const task = {
      type: "task",
      classId: "class",
      title: "Lesson",
      instructions: "Read",
      due: "2026-02-28",
    };
    expect(mobileCommandSchema.safeParse(task).success).toBe(true);
    expect(mobileCommandSchema.safeParse({ ...task, due: "2026-02-30" }).success).toBe(false);
    for (const text of ["   ", "x".repeat(10001)]) {
      expect(
        mobileCommandSchema.safeParse({ type: "message", to: "recipient", text }).success,
      ).toBe(false);
    }
  });
  it("rejects unknown operations and extra privilege fields", () => {
    expect(mobileCommandSchema.safeParse({ type: "deleteSchool" }).success).toBe(false);
    expect(
      mobileCommandSchema.safeParse({
        type: "message",
        to: "recipient",
        text: "Hello",
        admin: true,
      }).success,
    ).toBe(false);
  });
});
