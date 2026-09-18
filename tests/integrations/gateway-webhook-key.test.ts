import { describe, expect, it } from "vitest";
import {
  GATEWAY_WEBHOOK_KEY_GRACE_MS,
  buildRotatedWebhookConfig,
  gatewayWebhookApiKeyMatches,
  gatewayWebhookPreviousKeyActive,
  generateWebhookApiKey,
} from "@/features/integrations/gateway-webhook-key";

describe("generateWebhookApiKey", () => {
  it("gera string hex sem hífens", () => {
    const key = generateWebhookApiKey();
    expect(key).toMatch(/^[a-f0-9]{32}$/);
  });
});

describe("buildRotatedWebhookConfig", () => {
  it("preserva key anterior com expiração", () => {
    const now = Date.parse("2026-08-28T12:00:00.000Z");
    const result = buildRotatedWebhookConfig(
      { webhookApiKey: "old-key-123456789012345678901234" },
      now,
    );
    expect(result.webhookApiKey).not.toBe("old-key-123456789012345678901234");
    expect(result.config.webhookApiKeyPrevious).toBe("old-key-123456789012345678901234");
    expect(result.previousKeyValidUntil).toBe(
      new Date(now + GATEWAY_WEBHOOK_KEY_GRACE_MS).toISOString(),
    );
  });

  it("falha sem key existente", () => {
    expect(() => buildRotatedWebhookConfig({})).toThrow(/instale a integração/i);
  });
});

describe("gatewayWebhookApiKeyMatches", () => {
  const config = {
    webhookApiKey: "current-key",
    webhookApiKeyPrevious: "legacy-key",
    webhookApiKeyPreviousExpiresAt: "2026-08-29T12:00:00.000Z",
  };
  const now = Date.parse("2026-08-28T12:00:00.000Z");

  it("aceita key actual", () => {
    expect(gatewayWebhookApiKeyMatches(config, "current-key", now)).toBe(true);
  });

  it("aceita key anterior dentro da graça", () => {
    expect(gatewayWebhookApiKeyMatches(config, "legacy-key", now)).toBe(true);
  });

  it("rejeita key anterior expirada", () => {
    const expiredNow = Date.parse("2026-08-30T00:00:00.000Z");
    expect(gatewayWebhookApiKeyMatches(config, "legacy-key", expiredNow)).toBe(false);
  });

  it("rejeita key desconhecida", () => {
    expect(gatewayWebhookApiKeyMatches(config, "wrong", now)).toBe(false);
  });
});

describe("gatewayWebhookPreviousKeyActive", () => {
  it("detecta período de graça activo", () => {
    expect(
      gatewayWebhookPreviousKeyActive(
        {
          webhookApiKeyPrevious: "old",
          webhookApiKeyPreviousExpiresAt: "2026-08-29T12:00:00.000Z",
        },
        Date.parse("2026-08-28T12:00:00.000Z"),
      ),
    ).toBe(true);
  });
});
