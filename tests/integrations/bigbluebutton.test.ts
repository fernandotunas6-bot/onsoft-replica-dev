import { describe, expect, it } from "vitest";
import {
  canAccessVirtualClassroom,
  type ClassroomAuthorization,
} from "../../src/server/integrations/bigbluebutton-policy";
import {
  scopedMeetingId,
  bbbSignedUrl,
} from "../../src/server/integrations/bigbluebutton";

const base: ClassroomAuthorization = {
  authenticatedUserId: "teacher-1",
  activeSchoolId: "school-a",
  session: {
    id: "session-1",
    schoolId: "school-a",
    teacherId: "teacher-1",
    status: "scheduled",
  },
  membership: {
    userId: "teacher-1",
    schoolId: "school-a",
    role: "teacher",
    active: true,
  },
  teacherAssignment: {
    teacherUserId: "teacher-1",
    schoolId: "school-a",
    active: true,
  },
};

describe("BBB classroom policy", () => {
  it("permits assigned teacher to create scheduled classroom", () => {
    expect(canAccessVirtualClassroom("create", base)).toBe(true);
  });

  it("denies mismatched school even with active membership", () => {
    expect(
      canAccessVirtualClassroom("create", {
        ...base,
        session: { ...base.session, schoolId: "school-b" },
      }),
    ).toBe(false);
  });

  it("denies revoked teacher assignment", () => {
    expect(
      canAccessVirtualClassroom("create", {
        ...base,
        teacherAssignment: { ...base.teacherAssignment!, active: false },
      }),
    ).toBe(false);
  });

  it("denies inactive membership", () => {
    expect(
      canAccessVirtualClassroom("create", {
        ...base,
        membership: { ...base.membership!, active: false },
      }),
    ).toBe(false);
  });

  it("denies student joining a scheduled class", () => {
    const student: ClassroomAuthorization = {
      ...base,
      authenticatedUserId: "student-1",
      membership: {
        userId: "student-1",
        schoolId: "school-a",
        role: "student",
        active: true,
      },
      enrollment: {
        studentUserId: "student-1",
        schoolId: "school-a",
        active: true,
      },
    };
    expect(canAccessVirtualClassroom("join", student)).toBe(false);
    expect(
      canAccessVirtualClassroom("join", {
        ...student,
        session: { ...student.session, status: "live" },
      }),
    ).toBe(true);
    expect(
      canAccessVirtualClassroom("recordings", {
        ...student,
        session: { ...student.session, status: "ended" },
      }),
    ).toBe(false);
    expect(
      canAccessVirtualClassroom("recordings", {
        ...student,
        session: { ...student.session, status: "ended" },
        recordingsPublished: true,
      }),
    ).toBe(true);
  });

  it("denies an impostor user", () => {
    expect(
      canAccessVirtualClassroom("start", {
        ...base,
        authenticatedUserId: "impostor",
      }),
    ).toBe(false);
  });

  it("creates collision-resistant scoped identifiers for different segments", () => {
    expect(scopedMeetingId("ab", "c", "d")).not.toBe(
      scopedMeetingId("a", "bc", "d"),
    );
    expect(() => scopedMeetingId("../x", "c", "d")).toThrow();
  });

  it("signs requests with HTTPS and refuses HTTP", async () => {
    const url = await bbbSignedUrl(
      "join",
      { meetingID: "s", fullName: "Test User", password: "guest" },
      {
        endpoint: "https://bbb.example.com/bigbluebutton/api/",
        secret: "test-secret",
      },
    );
    expect(new URL(url).searchParams.get("checksum")).toMatch(/^[a-f0-9]{40}$/);
    await expect(
      bbbSignedUrl(
        "join",
        { meetingID: "s" },
        { endpoint: "http://bbb.example.com/api/", secret: "test" },
      ),
    ).rejects.toThrow("HTTPS");
  });
});
