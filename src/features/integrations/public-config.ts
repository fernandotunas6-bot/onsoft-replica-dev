/**
 * Server-to-browser integration projection.
 * No provider credentials, gateway verification keys or OAuth tokens cross
 * the server-function boundary. Empty form fields mean "keep existing".
 */
const SECRET_KEYS = /(?:^|_)(?:apiKey|api_key|accessToken|access_token|refreshToken|refresh_token|clientSecret|client_secret|password|secret|privateKey|private_key|webhookApiKey|webhook_api_key)(?:$|_)/i;
const SECRET_MERCHANT_PROVIDERS = new Set(["resend_email", "moodle", "canvas"]);
const SECRET_CALLBACK_PROVIDERS = new Set(["whatsapp_business"]);

export interface PublicIntegrationConfig {
  config: Record<string, unknown>;
  hasStoredSecret: { merchantId: boolean; callbackUrl: boolean; webhookApiKey: boolean };
}

export function projectIntegrationConfig(provider: string, source: unknown): PublicIntegrationConfig {
  const raw = source && typeof source === "object" && !Array.isArray(source)
    ? source as Record<string, unknown> : {};
  const merchantSecret = SECRET_MERCHANT_PROVIDERS.has(provider) && Boolean(raw["merchantId"]);
  const callbackSecret = SECRET_CALLBACK_PROVIDERS.has(provider) && Boolean(raw["callbackUrl"]);
  const webhookSecret = Boolean(raw["webhookApiKey"]);
  const config: Record<string, unknown> = {};
  // Use an allowlist, not a blacklist: a future provider cannot accidentally
  // expose a newly added credential field by adding it to its JSON config.
  for (const key of ["merchantId", "callbackUrl", "sandbox", "grantedCapabilities",
    "webhookApiKeyPreviousExpiresAt", "connectedAt", "accountName", "accountEmail"] as const) {
    if (!Object.prototype.hasOwnProperty.call(raw, key)) continue;
    if (SECRET_KEYS.test(key) || key === "merchantId" && merchantSecret
      || key === "callbackUrl" && callbackSecret) continue;
    const value = raw[key];
    if (typeof value === "string" || typeof value === "number" ||
      typeof value === "boolean" || value === null ||
      key === "grantedCapabilities" && Array.isArray(value) &&
        value.every((item) => typeof item === "string")) {
      config[key] = value;
    }
  }
  return { config, hasStoredSecret: {
    merchantId: merchantSecret, callbackUrl: callbackSecret, webhookApiKey: webhookSecret,
  } };
}
