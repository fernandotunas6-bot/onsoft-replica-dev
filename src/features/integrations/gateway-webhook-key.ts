/** Período em que a API key anterior continua válida após rotação (portal banco). */
export const GATEWAY_WEBHOOK_KEY_GRACE_MS = 24 * 60 * 60 * 1000;

export function generateWebhookApiKey() {
  return crypto.randomUUID().replace(/-/g, "");
}

export function buildRotatedWebhookConfig(existing: Record<string, unknown>, nowMs = Date.now()) {
  const current = String(existing.webhookApiKey ?? "").trim();
  if (!current) {
    throw new Error("Integração sem API key — instale a integração primeiro.");
  }
  const webhookApiKey = generateWebhookApiKey();
  const previousExpiresAt = new Date(nowMs + GATEWAY_WEBHOOK_KEY_GRACE_MS).toISOString();
  return {
    webhookApiKey,
    previousKeyValidUntil: previousExpiresAt,
    config: {
      ...existing,
      webhookApiKey,
      webhookApiKeyPrevious: current,
      webhookApiKeyPreviousExpiresAt: previousExpiresAt,
      webhookApiKeyRotatedAt: new Date(nowMs).toISOString(),
    },
  };
}

/** Compara apiKey activa ou anterior (dentro do período de graça). */
export function gatewayWebhookApiKeyMatches(
  config: Record<string, unknown>,
  apiKey: string,
  nowMs = Date.now(),
): boolean {
  const stored = String(config.webhookApiKey ?? "").trim();
  if (stored && stored === apiKey) return true;

  const previous = String(config.webhookApiKeyPrevious ?? "").trim();
  if (!previous || previous !== apiKey) return false;

  const expires = Date.parse(String(config.webhookApiKeyPreviousExpiresAt ?? ""));
  return Number.isFinite(expires) && nowMs <= expires;
}

export function gatewayWebhookPreviousKeyActive(
  config: Record<string, unknown>,
  nowMs = Date.now(),
): boolean {
  const previous = String(config.webhookApiKeyPrevious ?? "").trim();
  if (!previous) return false;
  const expires = Date.parse(String(config.webhookApiKeyPreviousExpiresAt ?? ""));
  return Number.isFinite(expires) && nowMs <= expires;
}
