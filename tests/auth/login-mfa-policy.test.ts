import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isLoginMfaEnabled, LOGIN_MFA_PREFERENCE_KEY } from "@/features/auth/login-mfa-policy";

describe("confirmação opcional no início de sessão", () => {
  it("está desligada para todos os utilizadores antigos e novos sem opção explícita", () => {
    expect(isLoginMfaEnabled(null)).toBe(false);
    expect(isLoginMfaEnabled({})).toBe(false);
    expect(isLoginMfaEnabled({ provider: "email" })).toBe(false);
    expect(isLoginMfaEnabled({ [LOGIN_MFA_PREFERENCE_KEY]: "true" })).toBe(false);
    expect(isLoginMfaEnabled({ [LOGIN_MFA_PREFERENCE_KEY]: false })).toBe(false);
  });

  it("só uma escolha verdadeira do utilizador exige segundo factor no login", () => {
    expect(isLoginMfaEnabled({ [LOGIN_MFA_PREFERENCE_KEY]: true })).toBe(true);
  });

  it("aplica a mesma opção à entrada e ao guard do servidor", () => {
    const root = process.cwd();
    const pending = readFileSync(join(root, "src/features/auth/pending-mfa.ts"), "utf8");
    const guard = readFileSync(join(root, "src/integrations/supabase/session-mfa.ts"), "utf8");
    expect(pending).toContain("isLoginMfaEnabled(sessionData.session?.user.app_metadata)");
    expect(guard).toContain("isLoginMfaEnabled(userData.user.app_metadata)");
    expect(guard).toContain('factor.status === "verified"');
    const gate = readFileSync(join(root, "src/components/auth/AuthGate.tsx"), "utf8");
    expect(gate).toContain("await pendingMfaFactors()");
  });

  it("a configuração só altera a identidade própria e exige confirmação recente", () => {
    const server = readFileSync(
      join(process.cwd(), "src/features/auth/login-mfa-server.ts"),
      "utf8",
    );
    expect(server).toContain(".middleware([requireSupabaseAuth])");
    expect(server).toContain("requireRecentVerification(context.claims");
    expect(server).toContain("userId: context.userId");
    expect(server).toContain('factor.status === "verified"');
    expect(server).toContain(
      "app_metadata: { ...original, [LOGIN_MFA_PREFERENCE_KEY]: data.enabled }",
    );
  });

  it("mantém as protecções aal2 de operações sensíveis", () => {
    const root = process.cwd();
    const platform = readFileSync(join(root, "src/features/saas/platform-guard.ts"), "utf8");
    const stepUp = readFileSync(join(root, "src/lib/step-up.ts"), "utf8");
    expect(platform).toContain('if (aal !== "aal2")');
    expect(stepUp).toContain("requireRecentVerification");
  });
});
