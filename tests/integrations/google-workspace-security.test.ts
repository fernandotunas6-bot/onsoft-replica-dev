import { describe, expect, it } from "vitest";
import { isPendingWorkspaceProvider } from "@/features/integrations/google-workspace-availability";
import {
  disconnectedWorkspaceStatus,
  GOOGLE_WORKSPACE_SCOPES_BY_SERVICE,
  unavailableWorkspaceOperation,
} from "@/integrations/google/workspace-security";

describe("Google Workspace separate consent", () => {
  it("blocks unimplemented Google catalog installations without affecting Resend or ICS", () => {
    expect(isPendingWorkspaceProvider("gmail_workspace")).toBe(true);
    expect(isPendingWorkspaceProvider("google_calendar")).toBe(true);
    expect(isPendingWorkspaceProvider("resend_email")).toBe(false);
    expect(isPendingWorkspaceProvider("apple_calendar")).toBe(false);
  });
  it("never equates an authenticated SIGA session with a Workspace connection", () => {
    const status = disconnectedWorkspaceStatus();
    expect(status.connected).toBe(false);
    expect(Object.values(status.services).every((enabled) => enabled === false)).toBe(true);
  });

  it("never invents provider IDs or returns a successful fake operation", () => {
    expect(unavailableWorkspaceOperation()).toMatchObject({ success: false });
    expect(unavailableWorkspaceOperation()).not.toHaveProperty("messageId");
    expect(unavailableWorkspaceOperation()).not.toHaveProperty("eventId");
  });

  it("uses separate least-privilege scopes per optional service", () => {
    expect(GOOGLE_WORKSPACE_SCOPES_BY_SERVICE.gmail)
      .toEqual(["https://www.googleapis.com/auth/gmail.send"]);
    expect(GOOGLE_WORKSPACE_SCOPES_BY_SERVICE.calendar)
      .toEqual(["https://www.googleapis.com/auth/calendar.events"]);
    expect(GOOGLE_WORKSPACE_SCOPES_BY_SERVICE.gmail.join(" "))
      .not.toContain("https://www.googleapis.com/auth/calendar");
  });
});
