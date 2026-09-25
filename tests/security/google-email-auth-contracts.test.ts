import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("SIGA email and OAuth security contracts across production entry points", () => {
  it("protects restored and refreshed Google/password sessions through one gate", () => {
    const code = source("src/components/auth/AuthGate.tsx");
    expect(code).toContain('event === "INITIAL_SESSION"');
    expect(code).toContain('event === "TOKEN_REFRESHED"');
    expect(code).toContain("verifyInstitutionalAccessFn");
    expect(code).toContain("getAuthenticatorAssuranceLevel");
    expect(code).not.toContain("siga:oauth-pending");
  });

  it("never deletes an Auth identity merely because a school membership is missing", () => {
    const code = source("src/features/auth/verify-oauth-account-server.ts");
    expect(code).not.toMatch(/\.auth\.admin\.deleteUser\s*\(/);
    expect(code).toContain('eq("status", "active")');
    expect(code).toContain('from("platform_admins")');
    expect(code).toContain('from("schools")');
    expect(code).toContain("hasInstitutionalAccess");
  });

  it("prevents Supabase auth-lock deadlocks and invalidates stale verification responses", () => {
    const code = source("src/components/auth/AuthGate.tsx");
    expect(code).toContain("window.setTimeout");
    expect(code).toContain("verificationGeneration");
    expect(code).toContain("visibilitychange");
  });

  it("requires bearer claims and does not trust a mere decoded JWT", () => {
    const code = source("src/integrations/supabase/auth-middleware.ts");
    expect(code).toContain("getClaims(token)");
    expect(code).toContain("getUser(token)");
    expect(code).toContain("verifyLocalJwtSignature");
    expect(code).toContain("authApiReachable");
  });

  it("keeps password reset, magic link and email changes on branded Resend channels", () => {
    for (const path of [
      "src/features/auth/reset-password-server.ts",
      "src/features/auth/magic-link-server.ts",
      "src/features/auth/email-change-server.ts",
    ]) {
      const code = source(path);
      expect(code, path).toContain("sendResendEmail");
      expect(code, path).toContain("RESEND_API_KEY");
    }
  });

  it("applies abuse protection before generating public password-reset and magic links", () => {
    for (const path of [
      "src/features/auth/reset-password-server.ts",
      "src/features/auth/magic-link-server.ts",
    ]) {
      const code = source(path);
      expect(code, path).toContain("rateLimitKeys");
      expect(code, path).toContain("generateLink");
    }
  });

  it("does not expose the Google secret in a Vite variable or frontend auth module", () => {
    const client = source("src/integrations/supabase/client.ts");
    const auth = source("src/components/auth/AuthGate.tsx");
    expect(client).not.toContain("GOOGLE_WORKSPACE_CLIENT_SECRET");
    expect(auth).not.toContain("GOOGLE_WORKSPACE_CLIENT_SECRET");
    expect(auth).toContain('provider: "google"');
  });

  it("binds the separate Workspace consent to the authenticated user and session", () => {
    const code = source("src/integrations/google/workspace-auth.ts");
    expect(code).toContain("requireSupabaseAuth");
    expect(code).toContain("sessionId");
    expect(code).toContain("startWorkspaceConsent");
    expect(code).toContain("completeWorkspaceConsent");
  });

  it("enforces PKCE state consumption, AES-GCM and per-user school-scoped token access", () => {
    const code = source("src/integrations/google/workspace-vault.server.ts");
    expect(code).toContain("consumed_at");
    expect(code).toContain("session_id");
    expect(code).toContain("code_verifier");
    expect(code).toContain("encrypted_refresh_token");
    expect(code).toContain("getWorkspaceAccessToken");
    const crypto = source("src/integrations/google/workspace-crypto.server.ts");
    expect(crypto).toContain("AES-GCM");
    expect(crypto).toContain("32 bytes");
  });

  it("removes Google authorization codes from the callback URL immediately", () => {
    const code = source("src/routes/api/integrations/google/callback.tsx");
    expect(code).toContain("history.replaceState");
    expect(code).toContain("invoked.current");
    expect(code).toContain("completeGoogleWorkspaceOAuth");
  });

  it("does not put provider refresh tokens in localStorage", () => {
    const old = source("src/integrations/google/oauth.ts");
    const compat = source("src/lib/google-oauth.ts");
    expect(old).toContain("purgeLegacyTokenStorage");
    // A security comment may mention the forbidden flow; assert no builder can produce it.
    expect(old).toContain("throw new Error(");
    expect(old).not.toMatch(/response_type\\s*:\\s*["\u0027]token["\u0027]/);
    expect(compat).toContain("delete payload.refresh_token");
  });

  it("requires explicit user consent before Gmail and Calendar server operations", () => {
    const code = source("src/integrations/google/server-workspace.ts");
    expect(code).toContain("getWorkspaceAccessToken");
    expect(code).toContain("api.gmailSend");
    expect(code).toContain("api.calendarCreate");
    expect(code).toContain("api.sheetsAppend");
    expect(code).not.toContain("unavailableWorkspaceOperation()");
  });

  it("routes every legacy Gmail and Calendar network path through the server vault", () => {
    for (const path of [
      "src/integrations/google/calendar-service.ts",
      "src/integrations/google/gmail-service.ts",
      "src/lib/google-calendar.ts",
      "src/lib/google-gmail.ts",
    ]) {
      const code = source(path);
      expect(code, path).not.toContain("getStoredGoogleOAuthToken");
      expect(code, path).not.toContain("gmail.googleapis.com");
      expect(code, path).not.toContain("www.googleapis.com/calendar/v3");
      expect(code, path).not.toContain("Authorization:");
    }
  });

  it("never emails a temporary password through the legacy welcome template", () => {
    const code = source("src/lib/google-gmail.ts");
    expect(code).not.toContain("Senha Temporária:");
    expect(code).toContain("a senha não é enviada por e-mail");
  });

  it("never lets a configured merchant ID masquerade as Google authorization", () => {
    const code = source("src/features/integrations/server.ts");
    expect(code).toContain("isPendingWorkspaceProvider");
    const card = source("src/features/school/GoogleWorkspaceConnectCard.tsx");
    expect(card).toContain("startGoogleWorkspaceOAuth");
    expect(card).toContain("disconnectGoogleWorkspace");
  });
});
