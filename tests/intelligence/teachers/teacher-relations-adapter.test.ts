import { describe, expect, it } from "vitest";
import { mapTeacherWorkspaceToSnapshot } from "@/features/intelligence/teachers/teacher-relations-adapter";

const teacher = { id: "teacher-1", email: "prof@escola.ao", phone: "+244900000000" };

describe("mapTeacherWorkspaceToSnapshot", () => {
  it("maps a teacher with classes, subjects, schedule and enrollments", () => {
    const snapshot = mapTeacherWorkspaceToSnapshot(teacher, {
      classes: [{ subject_id: "sub-1" }, { subject_id: "sub-2" }, { subject_id: "sub-1" }],
      schedule: [{}, {}],
      enrollments: [{}, {}, {}],
    });
    expect(snapshot.classes).toEqual({ count: 3, subjectCount: 2 });
    expect(snapshot.schedule).toEqual({ count: 2 });
    expect(snapshot.enrollments).toEqual({ count: 3 });
    expect(snapshot.profile).toEqual({ hasEmail: true, hasPhone: true });
  });

  it("flags a teacher with no workspace data yet", () => {
    const snapshot = mapTeacherWorkspaceToSnapshot(teacher, undefined);
    expect(snapshot.classes).toEqual({ count: 0, subjectCount: 0 });
    expect(snapshot.schedule).toEqual({ count: 0 });
    expect(snapshot.enrollments).toEqual({ count: 0 });
  });

  it("flags incomplete contact info", () => {
    const snapshot = mapTeacherWorkspaceToSnapshot(
      { ...teacher, email: null, phone: null },
      undefined,
    );
    expect(snapshot.profile).toEqual({ hasEmail: false, hasPhone: false });
  });
});
