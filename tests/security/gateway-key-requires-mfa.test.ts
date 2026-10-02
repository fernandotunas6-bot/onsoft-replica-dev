import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { maskGatewayWebhookKeys } from "@/features/integrations/gateway-webhook-key";

/**
 * A API key do gateway emite recibos pelo webhook público. Sem 2FA, entregá-la
 * ao browser (ou deixá-la rodar) contornava o 2FA que o dinheiro já exige.
 */
describe("API key do gateway só com 2FA", () => {
  const config = {
    webhookApiKey: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
    webhookApiKeyPrevious: "ffffeeeeddddccccbbbbaaaa99998888",
    merchantId: "12345",
  };

  it("sem 2FA só seguem os últimos 4 caracteres", () => {
    const masked = maskGatewayWebhookKeys(config, false);
    expect(masked.webhookApiKey).toBe("••••c5d6");
    expect(masked.webhookApiKeyMasked).toBe(true);
    expect(JSON.stringify(masked)).not.toContain(config.webhookApiKey);
    expect(masked.merchantId).toBe("12345");
  });

  it("com 2FA a key activa segue; a anterior nunca", () => {
    const revealed = maskGatewayWebhookKeys(config, true);
    expect(revealed.webhookApiKey).toBe(config.webhookApiKey);
    expect(revealed.webhookApiKeyMasked).toBeUndefined();
    expect(JSON.stringify(revealed)).not.toContain(config.webhookApiKeyPrevious);
  });

  it("rodar a key exige aal2 no servidor", () => {
    const code = readFileSync(join(process.cwd(), "src/features/integrations/server.ts"), "utf8");
    const rotate = code.slice(code.indexOf("export const rotateGatewayWebhookApiKey"));
    const body = rotate.slice(0, rotate.indexOf("buildRotatedWebhookConfig"));
    expect(body).toMatch(/requireAal2\(/);
  });

  it("a listagem passa a config pelo mascaramento", () => {
    const code = readFileSync(join(process.cwd(), "src/features/integrations/server.ts"), "utf8");
    const list = code.slice(code.indexOf("export const listSchoolIntegrations"));
    expect(list.slice(0, list.indexOf("export const listInstalledCapabilities"))).toMatch(
      /maskGatewayWebhookKeys\(/,
    );
  });
});
