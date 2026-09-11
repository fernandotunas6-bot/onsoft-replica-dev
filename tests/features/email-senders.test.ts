import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  resolveSystemSender,
  resolveResendFromAddress,
} from "@/features/integrations/resend-client";

describe("Email Senders Architecture - resolveSystemSender", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset env vars before each test
    delete process.env.RESEND_FROM_EMAIL;
    delete process.env.RESEND_FROM_ACADEMIC_EMAIL;
    delete process.env.RESEND_FROM_FINANCE_EMAIL;
    delete process.env.RESEND_FROM_AUTH_EMAIL;
    delete process.env.RESEND_FROM_SUPPORT_EMAIL;
    delete process.env.PLATFORM_DOMAIN;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("resolves default platform senders for each channel with fallback domain", () => {
    expect(resolveSystemSender("academic")).toBe("SIGA Académico <notificacoes@portal-siga.com>");
    expect(resolveSystemSender("finance")).toBe("SIGA Payflow <financeiro@portal-siga.com>");
    expect(resolveSystemSender("auth")).toBe("SIGA Segurança <seguranca@portal-siga.com>");
    expect(resolveSystemSender("support")).toBe("SIGA Suporte <suporte@portal-siga.com>");
    expect(resolveSystemSender("default")).toBe("SIGA Plus <noreply@portal-siga.com>");
  });

  it("respects custom platform domain when configured", () => {
    process.env.PLATFORM_DOMAIN = "siga.ao";
    expect(resolveSystemSender("academic")).toBe("SIGA Académico <notificacoes@siga.ao>");
    expect(resolveSystemSender("finance")).toBe("SIGA Payflow <financeiro@siga.ao>");
    expect(resolveSystemSender("auth")).toBe("SIGA Segurança <seguranca@siga.ao>");
    expect(resolveSystemSender("support")).toBe("SIGA Suporte <suporte@siga.ao>");
  });

  it("applies institutional school branding", () => {
    expect(
      resolveSystemSender("academic", { schoolName: "Colégio Esperança" }),
    ).toBe("Colégio Esperança via SIGA <notificacoes@portal-siga.com>");

    expect(
      resolveSystemSender("finance", { schoolName: "Colégio Esperança" }),
    ).toBe("Colégio Esperança (Financeiro) <financeiro@portal-siga.com>");

    expect(
      resolveSystemSender("auth", { schoolName: "Colégio Esperança" }),
    ).toBe("Colégio Esperança via SIGA <seguranca@portal-siga.com>");
  });

  it("allows custom displayName override", () => {
    expect(
      resolveSystemSender("finance", { displayName: "SIGA Payflow Alertas" }),
    ).toBe("SIGA Payflow Alertas <financeiro@portal-siga.com>");
  });

  it("respects specific environment variable overrides per channel", () => {
    process.env.RESEND_FROM_ACADEMIC_EMAIL = "Pautas Escolares <pautas@portal-siga.com>";
    process.env.RESEND_FROM_FINANCE_EMAIL = "Cobranças Payflow <cobrancas@portal-siga.com>";

    expect(resolveSystemSender("academic")).toBe("Pautas Escolares <pautas@portal-siga.com>");
    expect(resolveSystemSender("finance")).toBe("Cobranças Payflow <cobrancas@portal-siga.com>");
    // Outros canais mantêm resolução padrão
    expect(resolveSystemSender("auth")).toBe("SIGA Segurança <seguranca@portal-siga.com>");
  });

  it("handles resolveResendFromAddress edge cases", () => {
    expect(resolveResendFromAddress("")).toBe("SIGA Plus <onboarding@resend.dev>");
    expect(resolveResendFromAddress("custom@portal-siga.com")).toBe(
      "SIGA Plus <custom@portal-siga.com>",
    );
    expect(resolveResendFromAddress("Suporte <suporte@portal-siga.com>")).toBe(
      "Suporte <suporte@portal-siga.com>",
    );
  });
});
