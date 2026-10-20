import { describe, expect, it } from "vitest";
import {
  canUseReservedSignupEmail,
  isIsolatedSignupTestTarget,
  isReservedTestEmail,
  isSignupEmailVerificationRequired,
} from "@/features/saas/signup-verification";

const staging = {
  SIGA_E2E_ALLOW_WRITES: "1",
  SIGA_E2E_PROJECT_REF: "audittest",
  SUPABASE_PROJECT_ID: "audittest",
  SUPABASE_URL: "https://audittest.supabase.co",
  VITE_SUPABASE_URL: "https://audittest.supabase.co",
};
const production = "https://xodgfmxiaunpamctfeea.supabase.co";

describe("confirmação de e-mail do signup público: isolamento de E2E", () => {
  it("em produção é obrigatória mesmo com flag off", () => {
    expect(isSignupEmailVerificationRequired({ SIGNUP_EMAIL_VERIFICATION: "off" })).toBe(true);
    expect(
      isSignupEmailVerificationRequired({
        ...staging,
        SIGA_E2E_PROJECT_REF: "xodgfmxiaunpamctfeea",
        SUPABASE_PROJECT_ID: "xodgfmxiaunpamctfeea",
        SUPABASE_URL: production,
        VITE_SUPABASE_URL: production,
        SIGNUP_EMAIL_VERIFICATION: "off",
      }),
    ).toBe(true);
  });

  it("o E2E só é aceite quando o projecto e todas as URLs coincidem", () => {
    expect(isIsolatedSignupTestTarget(staging)).toBe(true);
    expect(isIsolatedSignupTestTarget({ ...staging, SIGA_E2E_ALLOW_WRITES: "0" })).toBe(false);
    expect(isIsolatedSignupTestTarget({ ...staging, SIGA_E2E_PROJECT_REF: "" })).toBe(false);
    expect(isIsolatedSignupTestTarget({ ...staging, SUPABASE_PROJECT_ID: "outra" })).toBe(false);
    expect(isIsolatedSignupTestTarget({ ...staging, VITE_SUPABASE_URL: production })).toBe(false);
    expect(
      isIsolatedSignupTestTarget({ ...staging, NEXT_PUBLIC_SUPABASE_URL: production }),
    ).toBe(false);
  });

  it("rejeita URL enganador, credenciais embutidas e protocolo inseguro", () => {
    for (const value of [
      "https://audittest.supabase.co.evil.test",
      "https://u:p@audittest.supabase.co",
      "http://audittest.supabase.co",
      "not-a-url",
    ]) {
      expect(isIsolatedSignupTestTarget({ ...staging, SUPABASE_URL: value })).toBe(false);
    }
  });

  it("nenhum projecto desconhecido é aceite sem URL do backend", () => {
    expect(
      isIsolatedSignupTestTarget({
        SIGA_E2E_ALLOW_WRITES: "1",
        SIGA_E2E_PROJECT_REF: "audittest",
      }),
    ).toBe(false);
  });

  it("mantém E2E local explicitamente autorizado", () => {
    const local = {
      SIGA_E2E_ALLOW_WRITES: "1",
      SIGA_E2E_PROJECT_REF: "local",
      SUPABASE_URL: "http://localhost:54321",
    };
    expect(isIsolatedSignupTestTarget(local)).toBe(true);
    expect(isIsolatedSignupTestTarget({ ...local, SUPABASE_URL: production })).toBe(false);
  });

  it("apenas staging seguro pode desligar verificação para um teste controlado", () => {
    expect(isSignupEmailVerificationRequired({ ...staging, SIGNUP_EMAIL_VERIFICATION: "off" })).toBe(
      false,
    );
    expect(isSignupEmailVerificationRequired(staging)).toBe(true);
    expect(isSignupEmailVerificationRequired({ ...staging, SIGNUP_EMAIL_VERIFICATION: "on" })).toBe(
      true,
    );
    expect(
      isSignupEmailVerificationRequired({
        ...staging,
        VITE_SUPABASE_URL: production,
        SIGNUP_EMAIL_VERIFICATION: "off",
      }),
    ).toBe(true);
  });

  it("só em staging autoriza domínio de testes, nunca em produção", () => {
    for (const email of [
      "e2e@siga-plus.test",
      "a@sample.example",
      "a@sample.invalid",
      "a@localhost",
    ]) {
      expect(isReservedTestEmail(email)).toBe(true);
      expect(canUseReservedSignupEmail(email, staging)).toBe(true);
      expect(canUseReservedSignupEmail(email, {})).toBe(false);
      expect(canUseReservedSignupEmail(email, { ...staging, VITE_SUPABASE_URL: production })).toBe(
        false,
      );
    }
    expect(canUseReservedSignupEmail("real@escola.ao", staging)).toBe(false);
  });
});
