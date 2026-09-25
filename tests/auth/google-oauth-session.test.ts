import { describe, expect, it } from "vitest";
import { shouldVerifyGoogleOAuthSession } from "@/features/auth/google-oauth-session";
import type { Session } from "@supabase/supabase-js";

function session(provider: string): Pick<Session, "user"> {
  return { user: { app_metadata: { provider } } as Session["user"] };
}

describe("Google OAuth session verification", () => {
  it("checks first sign-in when the redirect marker is present", () => {
    expect(shouldVerifyGoogleOAuthSession(session("email"), true)).toBe(true);
  });

  it("checks restored Google sessions after reload", () => {
    expect(shouldVerifyGoogleOAuthSession(session("google"))).toBe(true);
  });

  it("does not subject ordinary password sessions to the Google-only gate", () => {
    expect(shouldVerifyGoogleOAuthSession(session("email"))).toBe(false);
  });

  it("does not attempt checks before a session exists", () => {
    expect(shouldVerifyGoogleOAuthSession(null, true)).toBe(false);
  });
});
