import { describe, expect, it } from "vitest";
import { detectAttendanceAnomalies } from "@/features/catracas/server";

const names = new Map([["person-1", "Ana Domingos"]]);

describe("detectAttendanceAnomalies", () => {
  it("flags a student who entered the campus but was marked absent in class", () => {
    const anomalies = detectAttendanceAnomalies(
      [{ student_id: "student-1", person_id: "person-1", created_at: "2026-08-26T06:30:00" }],
      new Map([["student-1", "absent"]]),
      names,
    );
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]).toMatchObject({
      studentId: "student-1",
      studentName: "Ana Domingos",
      issueType: "present_at_gate_absent_in_class",
      severity: "high",
    });
  });

  it("flags a late gate entry when the student is not marked absent", () => {
    const anomalies = detectAttendanceAnomalies(
      [{ student_id: "student-1", person_id: "person-1", created_at: "2026-08-26T09:15:00" }],
      new Map([["student-1", "present"]]),
      names,
    );
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]?.issueType).toBe("late_gate_entry");
    expect(anomalies[0]?.severity).toBe("medium");
  });

  it("does not flag a student who entered on time and attended class", () => {
    const anomalies = detectAttendanceAnomalies(
      [{ student_id: "student-1", person_id: "person-1", created_at: "2026-08-26T06:30:00" }],
      new Map([["student-1", "present"]]),
      names,
    );
    expect(anomalies).toEqual([]);
  });

  it("prioritises the absent-in-class anomaly over the late-entry check", () => {
    const anomalies = detectAttendanceAnomalies(
      [{ student_id: "student-1", person_id: "person-1", created_at: "2026-08-26T09:15:00" }],
      new Map([["student-1", "absent"]]),
      names,
    );
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]?.issueType).toBe("present_at_gate_absent_in_class");
  });

  it("deduplicates repeated gate entries for the same student", () => {
    const anomalies = detectAttendanceAnomalies(
      [
        { student_id: "student-1", person_id: "person-1", created_at: "2026-08-26T09:15:00" },
        { student_id: "student-1", person_id: "person-1", created_at: "2026-08-26T10:00:00" },
      ],
      new Map(),
      names,
    );
    expect(anomalies).toHaveLength(1);
  });

  it("falls back to a generic name when the person is not in the lookup map", () => {
    const anomalies = detectAttendanceAnomalies(
      [{ student_id: "student-1", person_id: "unknown-person", created_at: "2026-08-26T09:15:00" }],
      new Map(),
      names,
    );
    expect(anomalies[0]?.studentName).toBe("Estudante");
  });

  it("ignores gate entries without a student id", () => {
    const anomalies = detectAttendanceAnomalies(
      [{ student_id: null, person_id: "person-1", created_at: "2026-08-26T09:15:00" }],
      new Map(),
      names,
    );
    expect(anomalies).toEqual([]);
  });
});
