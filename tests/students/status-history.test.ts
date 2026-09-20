import { describe, expect, it, vi } from "vitest";

import { recordStudentStatusHistory } from "@/features/students/status-history";

describe("recordStudentStatusHistory", () => {
  it("inserts a history row", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const db = { from: vi.fn(() => ({ insert })) } as never;
    await recordStudentStatusHistory(db, {
      schoolId: "school-1",
      studentId: "student-1",
      previousStatus: "applicant",
      newStatus: "active",
      reason: "teste",
      changedBy: "user-1",
    });
    expect(insert).toHaveBeenCalledWith({
      school_id: "school-1",
      student_id: "student-1",
      previous_status: "applicant",
      new_status: "active",
      reason: "teste",
      changed_by: "user-1",
    });
  });

  it("swallows missing-table errors", async () => {
    const insert = vi.fn().mockResolvedValue({
      error: { message: 'relation "student_status_history" does not exist', code: "42P01" },
    });
    const db = { from: vi.fn(() => ({ insert })) } as never;
    await expect(
      recordStudentStatusHistory(db, {
        schoolId: "school-1",
        studentId: "student-1",
        previousStatus: null,
        newStatus: "active",
        changedBy: "user-1",
      }),
    ).resolves.toBeUndefined();
  });
});
