import { describe, expect, it, vi } from "vitest";
import { joinVirtualClassroom } from "../../src/server/integrations/bigbluebutton-service";
import type { ClassroomAuthorization } from "../../src/server/integrations/bigbluebutton-policy";

vi.mock("../../src/server/integrations/bigbluebutton", () => ({
  scopedMeetingId: vi.fn(() => "meeting-1"),
  getBbbJoinUrl: vi.fn(async () => "https://bbb.example.org/join"),
}));

const ctx: ClassroomAuthorization = {
  authenticatedUserId: "student-a",
  activeSchoolId: "school-a",
  session: {
    id: "session-a",
    schoolId: "school-a",
    teacherId: "teacher-a",
    status: "live",
  },
  membership: {
    userId: "student-a",
    schoolId: "school-a",
    role: "student",
    active: true,
  },
  enrollment: {
    studentUserId: "student-a",
    schoolId: "school-a",
    active: true,
  },
};

describe("BBB trusted service", () => {
  it("rejects student moderator escalation", async () => {
    await expect(
      joinVirtualClassroom(
        {
          context: ctx,
          classGroupId: "class-a",
          sessionId: "session-a",
          title: "Matemática",
          fullName: "Aluno",
        },
        "moderator",
      ),
    ).rejects.toThrow("Moderator access denied");
  });

  it("rejects cross-school classroom requests", async () => {
    await expect(
      joinVirtualClassroom(
        {
          context: { ...ctx, activeSchoolId: "school-b" },
          classGroupId: "class-a",
          sessionId: "session-a",
          title: "Matemática",
          fullName: "Aluno",
        },
        "attendee",
      ),
    ).rejects.toThrow("access denied");
  });
});
