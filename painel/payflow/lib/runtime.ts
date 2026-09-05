import { env } from "./cf-env.ts";
import { resolveTrustedHttpsUrl } from "./trusted-url.ts";

export { resolveTrustedHttpsUrl } from "./trusted-url.ts";

export type PayflowRuntimeMode = "production" | "sandbox";

type RuntimeValues = Record<string, unknown>;

function readRuntimeValue(name: string): string {
  const workerValue = (env as unknown as RuntimeValues)?.[name];
  if (typeof workerValue === "string") return workerValue.trim();

  if (typeof process !== "undefined") {
    return process.env[name]?.trim() ?? "";
  }

  return "";
}

export function getPayflowRuntimeMode(): PayflowRuntimeMode {
  return readRuntimeValue("PAYFLOW_RUNTIME_MODE").toLowerCase() === "sandbox"
    ? "sandbox"
    : "production";
}

export function isSandboxRuntime() {
  return getPayflowRuntimeMode() === "sandbox";
}

export function getIntegrationApiKey() {
  return readRuntimeValue("PAYFLOW_INTEGRATION_API_KEY");
}

export function getSsoSecret() {
  return readRuntimeValue("PAYFLOW_SSO_SECRET");
}

export function isSsoConfigured() {
  return getSsoSecret().length >= 32;
}

export function getTransferExpiryHours() {
  const parsed = Number(readRuntimeValue("PAYFLOW_TRANSFER_EXPIRY_HOURS") || "72");
  return Number.isInteger(parsed) && parsed >= 24 && parsed <= 168 ? parsed : 72;
}

export function isIntegrationConfigured() {
  return getIntegrationApiKey().length >= 24;
}

export function getSigaBaseUrl() {
  const resolved = resolveTrustedHttpsUrl(readRuntimeValue("PAYFLOW_SIGA_URL"));
  if (!resolved) return null;
  return new URL(resolved).origin;
}

export function getAlertWebhookUrl() {
  return resolveTrustedHttpsUrl(readRuntimeValue("PAYFLOW_ALERT_WEBHOOK_URL"));
}

export function getBankConnectorUrl() {
  return resolveTrustedHttpsUrl(readRuntimeValue("PAYFLOW_BANK_CONNECTOR_URL"));
}

export function getBankConnectorKey() {
  return readRuntimeValue("PAYFLOW_BANK_CONNECTOR_KEY");
}

export function isBankConnectorConfigured() {
  return Boolean(getBankConnectorUrl() && getBankConnectorKey().length >= 16);
}

export function isEmisHomologated() {
  return (
    readRuntimeValue("PAYFLOW_EMIS_HOMOLOGATED") === "1" &&
    Boolean(resolveTrustedHttpsUrl(readRuntimeValue("EMIS_BASE_URL"))) &&
    readRuntimeValue("EMIS_API_KEY").length >= 16 &&
    readRuntimeValue("EMIS_WEBHOOK_SECRET").length >= 16
  );
}

export function getPublicRuntimeStatus() {
  const mode = getPayflowRuntimeMode();
  const emisReady = isEmisHomologated();
  return {
    mode,
    sandboxEnabled: mode === "sandbox",
    demoDataEnabled: false,
    browserConfirmationEnabled: mode === "sandbox",
    integrationConfigured: isIntegrationConfigured(),
    ssoConfigured: isSsoConfigured(),
    provider: mode === "sandbox" ? "emis_sandbox" : emisReady ? "emis_pending_adapter" : "unconfigured",
    providerConfigured: mode === "sandbox",
    emisHomologated: emisReady,
    paymentInitiationEnabled: mode === "sandbox",
    bankTransferSupported: true,
    bankConnectorConfigured: isBankConnectorConfigured(),
    alertWebhookConfigured: Boolean(getAlertWebhookUrl()),
    sigaSettlementConfigured: Boolean(getSigaBaseUrl() && isIntegrationConfigured()),
    sigaUrl: getSigaBaseUrl(),
  } as const;
}
