import { describe, expect, it } from "vitest";
import { projectIntegrationConfig } from "@/features/integrations/public-config";

describe("server response does not leak integration credentials", () => {
  it("hides Resend keys and retains non-sensitive sender settings", () => {
    const result = projectIntegrationConfig("resend_email", {
      merchantId: "re_secret_value", callbackUrl: "escola.ao",
      apiKey: "another-secret", grantedCapabilities: ["resend.send"],
    });
    expect(result.config).toEqual({
      callbackUrl: "escola.ao", grantedCapabilities: ["resend.send"],
    });
    expect(result.hasStoredSecret.merchantId).toBe(true);
    expect(JSON.stringify(result)).not.toContain("re_secret_value");
    expect(JSON.stringify(result)).not.toContain("another-secret");
  });

  it("hides WhatsApp bearer tokens but preserves the phone number ID", () => {
    const result = projectIntegrationConfig("whatsapp_business", {
      merchantId: "phone-number-id", callbackUrl: "wa_access_token",
      accessToken: "secret", webhookApiKey: "webhook-secret",
    });
    expect(result.config.merchantId).toBe("phone-number-id");
    expect(result.hasStoredSecret.callbackUrl).toBe(true);
    expect(result.hasStoredSecret.webhookApiKey).toBe(true);
    expect(JSON.stringify(result)).not.toContain("wa_access_token");
    expect(JSON.stringify(result)).not.toContain("webhook-secret");
  });

  it("prevents stored gateway verification keys from reaching the browser", () => {
    const result = projectIntegrationConfig("multicaixa_express", {
      merchantId: "99824", webhookApiKey: "super-secret",
      webhookApiKeyPrevious: "previous-secret",
      webhookApiKeyPreviousExpiresAt: "2026-09-26T09:00:00Z",
    });
    expect(result.config).toEqual({
      merchantId: "99824", webhookApiKeyPreviousExpiresAt: "2026-09-26T09:00:00Z",
    });
    expect(result.hasStoredSecret.webhookApiKey).toBe(true);
    expect(JSON.stringify(result)).not.toContain("super-secret");
    expect(JSON.stringify(result)).not.toContain("previous-secret");
  });

  it("treats Moodle/Canvas provider merchant fields as API secrets", () => {
    for (const provider of ["moodle", "canvas"]) {
      const config = projectIntegrationConfig(provider, {
        merchantId: "access-token-value", callbackUrl: "https://lms.school.ao",
      });
      expect(config.config).toEqual({ callbackUrl: "https://lms.school.ao" });
      expect(config.hasStoredSecret.merchantId).toBe(true);
    }
  });

  it("rejects nested JSON and unknown future credential keys by default", () => {
    const result = projectIntegrationConfig("new-provider", {
      merchantId: "public", unknownSecret: "never-expose",
      nested: { token: "nested-secret" }, config: { apiKey: "secret" },
    });
    expect(result.config).toEqual({ merchantId: "public" });
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("does not return config for pending Workspace providers", () => {
    const result = projectIntegrationConfig("google_classroom", {});
    expect(result.config).toEqual({});
    expect(result.hasStoredSecret).toEqual({
      merchantId: false, callbackUrl: false, webhookApiKey: false,
    });
  });
});
