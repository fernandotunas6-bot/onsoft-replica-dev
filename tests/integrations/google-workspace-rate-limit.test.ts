import { describe, expect, it } from "vitest";
import { assertWorkspaceWriteRateLimit } from "@/integrations/google/workspace-rate-limit.server";

describe("Google Workspace write rate limits", () => {
  it("caps Gmail sends per authenticated user and school", () => {
    const base = {
      userId: "user-rate-limit-gmail",
      schoolId: "school-rate-limit-gmail",
      action: "gmail.send",
    };
    for (let i = 0; i < 20; i++) {
      expect(() => assertWorkspaceWriteRateLimit(base)).not.toThrow();
    }
    expect(() => assertWorkspaceWriteRateLimit(base)).toThrow("Limite temporário");
  });

  it("keeps read-only probes outside write throttles", () => {
    for (let i = 0; i < 500; i++) {
      expect(() => assertWorkspaceWriteRateLimit({
        userId: "user-read-probe",
        schoolId: "school-read-probe",
        action: "drive.list",
      })).not.toThrow();
    }
  });

  it("cannot bypass the Gmail quota by switching schools, but actions stay independent", () => {
    const userId = "user-isolated";
    for (let i = 0; i < 20; i++) {
      assertWorkspaceWriteRateLimit({ userId, schoolId: "school-a", action: "gmail.send" });
    }
    expect(() => assertWorkspaceWriteRateLimit({
      userId, schoolId: "school-b", action: "gmail.send",
    })).toThrow("Limite temporário");
    expect(() => assertWorkspaceWriteRateLimit({
      userId, schoolId: "school-a", action: "calendar.create",
    })).not.toThrow();
  });
});
