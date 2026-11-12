import { describe, expect, it } from "vitest";
import {
  canAccessVirtualClassroom,
  type ClassroomAuthorization,
} from "../../src/server/integrations/bigbluebutton-policy";

const makeContext = (): ClassroomAuthorization => ({
  authenticatedUserId: "teacher-a",
  activeSchoolId: "school-a",
  session: {
    id: "session-a",
    schoolId: "school-a",
    teacherId: "teacher-record-a",
    classGroupId: "class-a",
    status: "scheduled",
  },
  membership: {
    userId: "teacher-a",
    schoolId: "school-a",
    role: "teacher",
    active: true,
  },
  teacherAssignment: {
    teacherUserId: "teacher-a",
    teacherId: "teacher-record-a",
    schoolId: "school-a",
    active: true,
  },
});

describe("BBB tenant isolation matrix", () => {
  it.each(["create", "start", "join", "end", "recordings"] as const)(
    "denies %s when school is changed",
    (action) => {
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

  it("allows assigned teacher when teacher record ID differs from auth user ID", () => {
    const context = makeContext();
    expect(canAccessVirtualClassroom("create", context)).toBe(true);
  });

  it("denies teacher with unrelated record ID", () => {
    const context = makeContext();
    context.teacherAssignment!.teacherId = "teacher-record-b";
    expect(canAccessVirtualClassroom("start", context)).toBe(false);
  });

  it("denies teacher with unrelated assignment", () => {
    const context = makeContext();
    context.teacherAssignment!.teacherUserId = "teacher-b";
    expect(canAccessVirtualClassroom("start", context)).toBe(false);
  });

  it("denies a student with enrollment in a different school", () => {
    const context = makeContext();
    context.authenticatedUserId = "student-a";
    context.membership = {
      userId: "student-a",
      schoolId: "school-a",
      role: "student",
      active: true,
    };
    context.session.status = "live";
    context.enrollment = {
      studentUserId: "student-a",
      schoolId: "school-b",
      classGroupId: "class-a",
      active: true,
    };
    expect(canAccessVirtualClassroom("join", context)).toBe(false);
  });

  it("denies an inactive student enrollment", () => {
    const context = makeContext();
    context.authenticatedUserId = "student-a";
    context.membership = {
      userId: "student-a",
      schoolId: "school-a",
      role: "student",
      active: true,
    };
    context.session.status = "live";
    context.enrollment = {
      studentUserId: "student-a",
      schoolId: "school-a",
      classGroupId: "class-a",
      active: false,
    };
    expect(canAccessVirtualClassroom("join", context)).toBe(false);
  });

  it("denies a student enrolled in another class of the same school", () => {
    const context = makeContext();
    context.authenticatedUserId = "student-a";
    context.membership = {
      userId: "student-a",
      schoolId: "school-a",
      role: "student",
      active: true,
    };
    context.enrollment = {
      studentUserId: "student-a",
      schoolId: "school-a",
      classGroupId: "class-b",
      active: true,
    };
    context.session.status = "live";
    expect(canAccessVirtualClassroom("join", context)).toBe(false);
    context.session.status = "ended";
    context.recordingsPublished = true;
    expect(canAccessVirtualClassroom("recordings", context)).toBe(false);
  });

  it("denies access without an active membership", () => {
    const context = makeContext();
    context.membership!.active = false;
    expect(canAccessVirtualClassroom("start", context)).toBe(false);
  });

  it("denies a teacher whose assignment is inactive", () => {
    const context = makeContext();
    context.teacherAssignment!.active = false;
    expect(canAccessVirtualClassroom("start", context)).toBe(false);
  });

  it("denies a teacher assigned to a different school", () => {
    const context = makeContext();
    context.teacherAssignment!.schoolId = "school-b";
    expect(canAccessVirtualClassroom("start", context)).toBe(false);
  });

  it("allows an enrolled student to join a live session, but never start it", () => {
    const context = makeContext();
    context.authenticatedUserId = "student-a";
    context.membership = {
      userId: "student-a",
      schoolId: "school-a",
      role: "student",
      active: true,
    };
    context.enrollment = {
      studentUserId: "student-a",
      schoolId: "school-a",
      classGroupId: "class-a",
      active: true,
    };
    context.session.status = "live";
    expect(canAccessVirtualClassroom("join", context)).toBe(true);
    expect(canAccessVirtualClassroom("start", context)).toBe(false);
    expect(canAccessVirtualClassroom("end", context)).toBe(false);
  });

  it("requires explicit publication before a student can view recordings", () => {
    const context = makeContext();
    context.authenticatedUserId = "student-a";
    context.membership = {
      userId: "student-a",
      schoolId: "school-a",
      role: "student",
      active: true,
    };
    context.enrollment = {
      studentUserId: "student-a",
      schoolId: "school-a",
      classGroupId: "class-a",
      active: true,
    };
    context.session.status = "ended";
    expect(canAccessVirtualClassroom("recordings", context)).toBe(false);
    context.recordingsPublished = true;
    expect(canAccessVirtualClassroom("recordings", context)).toBe(true);
  });

  it("denies any action for a cancelled session", () => {
    const context = makeContext();
    context.session.status = "cancelled";
    expect(canAccessVirtualClassroom("create", context)).toBe(false);
    expect(canAccessVirtualClassroom("join", context)).toBe(false);
  });
});
