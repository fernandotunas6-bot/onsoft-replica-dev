import { beforeEach, describe, expect, it, vi } from "vitest";
import { pendingMfaFactors } from "@/features/auth/pending-mfa";

const auth = vi.hoisted(() => ({ session: vi.fn(), assurance: vi.fn(), factors: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: auth.session, mfa: { getAuthenticatorAssuranceLevel: auth.assurance } },
  },
}));
vi.mock("@/features/auth/verification", () => ({ listVerificationFactors: auth.factors }));

beforeEach(() => {
  vi.clearAllMocks();
  auth.assurance.mockResolvedValue({ data: { currentLevel: "aal1", nextLevel: "aal2" } });
  auth.factors.mockResolvedValue({ totpId: "existing-totp", passkeyId: null });
});

describe("login mantém a confirmação MFA voluntária da PR #369", () => {
  for (const metadata of [{}, { siga_login_mfa_enabled: false }]) {
    it(`não pede código com a opção desligada (${JSON.stringify(metadata)})`, async () => {
      auth.session.mockResolvedValue({ data: { session: { user: { app_metadata: metadata } } } });
      expect(await pendingMfaFactors()).toBeNull();
      expect(auth.assurance).not.toHaveBeenCalled();
      expect(auth.factors).not.toHaveBeenCalled();
    });
  }

  it("pede confirmação quando a própria conta activou a opção", async () => {
    auth.session.mockResolvedValue({
      data: { session: { user: { app_metadata: { siga_login_mfa_enabled: true } } } },
    });
    expect(await pendingMfaFactors()).toEqual({ totpId: "existing-totp", passkeyId: null });
  });

  it("não repete o desafio de uma sessão já confirmada", async () => {
    auth.session.mockResolvedValue({
      data: { session: { user: { app_metadata: { siga_login_mfa_enabled: true } } } },
    });
    auth.assurance.mockResolvedValue({ data: { currentLevel: "aal2", nextLevel: "aal2" } });
    expect(await pendingMfaFactors()).toBeNull();
    expect(auth.factors).not.toHaveBeenCalled();
  });
});
