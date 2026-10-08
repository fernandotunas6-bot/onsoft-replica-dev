import { describe, expect, it } from "vitest";
import { canAccessVirtualClassroom, type ClassroomAuthorization } from "../../src/server/integrations/bigbluebutton-policy";

const makeContext = (): ClassroomAuthorization => ({
  authenticatedUserId: "teacher-a",
  activeSchoolId: "school-a",
  session: { id: "session-a", schoolId: "school-a", teacherId: "teacher-a", status: "scheduled" },
  membership: { userId: "teacher-a", schoolId: "school-a", role: "teacher", active: true },
  teacherAssignment: { teacherUserId: "teacher-a", schoolId: "school-a", active: true },
});

describe("BBB tenant isolation matrix", () => {
  it.each(["create", "start", "join", "end", "recordings"] as const)(
    "denies %s when school is changed", (action) => {
      const context = makeContext();
      context.session.schoolId = "school-b";
      context.session.status = action === "recordings" ? "ended" : "live";
      expect(canAccessVirtualClassroom(action, context)).toBe(false);
    },
  );
  it("denies membership belonging to another school", () => {
    const context = makeContext();
    context.membership!.schoolId = "school-b";
    expect(canAccessVirtualClassroom("create", context)).toBe(false);
  });
  it("denies teacher with unrelated assignment", () => {
    const context = makeContext();
    context.teacherAssignment!.teacherUserId = "teacher-b";
    expect(canAccessVirtualClassroom("start", context)).toBe(false);
  });
  it("denies a student with enrollment in a different school", () => {
    const context = makeContext();
    context.authenticatedUserId = "student-a";
    context.membership = { userId: "student-a", schoolId: "school-a", role: "student", active: true };
    context.session.status = "live";
    context.enrollment = { studentUserId: "student-a", schoolId: "school-b", active: true };
    expect(canAccessVirtualClassroom("join", context)).toBe(false);
  });
  it("denies an inactive student enrollment", () => {
    const context = makeContext();
    context.authenticatedUserId = "student-a";
    context.membership = { userId: "student-a", schoolId: "school-a", role: "student", active: true };
    context.session.status = "live";
    context.enrollment = { studentUserId: "student-a", schoolId: "school-a", active: false };
    expect(canAccessVirtualClassroom("join", context)).toBe(false);
  });
  it("denies any action for a cancelled session", () => {
    const context = makeContext();
    context.session.status = "cancelled";
    expect(canAccessVirtualClassroom("create", context)).toBe(false);
    expect(canAccessVirtualClassroom("join", context)).toBe(false);
  });
});
