import { describe, expect, it } from "vitest";
import { mapStudentProfileToSnapshot } from "@/features/intelligence/students/student-relations-adapter";

const baseProfile = {
  id: "student-1",
  enrollment_id: "enroll-1",
  enrollment_status: "active",
  class_name: "10ª A",
  grade_name: "10ª Classe",
  final_average: 14,
  attendance_rate: 92,
};

describe("mapStudentProfileToSnapshot", () => {
  it("maps a fully complete student", () => {
    const snapshot = mapStudentProfileToSnapshot(
      baseProfile,
      [{ is_primary: true }],
      [{ student_id: "student-1", status: "paid", due_on: "2026-01-10" }],
      { requests: [] },
      { years: [{ academicYearId: "year-1" }] },
    );

    expect(snapshot.enrollment).toEqual({
      id: "enroll-1",
      status: "active",
      className: "10ª A",
      gradeName: "10ª Classe",
    });
    expect(snapshot.finance).toEqual({ hasData: true, overdueCount: 0, overallStatus: "settled" });
    expect(snapshot.documents).toEqual({ hasData: true, pendingCount: 0 });
    expect(snapshot.guardians).toEqual({ count: 1, hasPrimary: true });
    expect(snapshot.academic.hasHistory).toBe(true);
  });

  it("flags no active enrollment", () => {
    const snapshot = mapStudentProfileToSnapshot(
      { ...baseProfile, enrollment_id: null, enrollment_status: null, class_name: null },
      [],
      [],
      { requests: [] },
      { years: [] },
    );
    expect(snapshot.enrollment.id).toBeNull();
    expect(snapshot.guardians).toEqual({ count: 0, hasPrimary: false });
  });

  it("counts overdue invoices scoped to this student only", () => {
    const snapshot = mapStudentProfileToSnapshot(
      baseProfile,
      [{ is_primary: true }],
      [
        { student_id: "student-1", status: "pending", due_on: "2020-01-01" },
        { student_id: "other-student", status: "pending", due_on: "2020-01-01" },
      ],
      undefined,
      undefined,
    );
    expect(snapshot.finance).toEqual({ hasData: true, overdueCount: 1, overallStatus: "overdue" });
    expect(snapshot.documents).toEqual({ hasData: false, pendingCount: 0 });
    expect(snapshot.academic.hasHistory).toBe(false);
  });

  it("counts pending document requests for this student", () => {
    const snapshot = mapStudentProfileToSnapshot(
      baseProfile,
      [{ is_primary: true }],
      [],
      {
        requests: [
          { student_id: "student-1", status: "queued" },
          { student_id: "student-1", status: "ready" },
          { student_id: "other-student", status: "queued" },
        ],
      },
      { years: [] },
    );
    expect(snapshot.documents).toEqual({ hasData: true, pendingCount: 1 });
  });
});
