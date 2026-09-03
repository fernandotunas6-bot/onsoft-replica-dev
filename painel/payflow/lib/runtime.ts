import { env } from "@/lib/cf-env";

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
  const value = readRuntimeValue("PAYFLOW_SIGA_URL");
  if (!value) return null;

  try {
    const url = new URL(value);
    const localHostname = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    return url.protocol === "https:" || localHostname ? url.origin : null;
  } catch {
    return null;
  }
}

export function getPublicRuntimeStatus() {
  const mode = getPayflowRuntimeMode();
  return {
    mode,
    sandboxEnabled: mode === "sandbox",
    demoDataEnabled: false,
    browserConfirmationEnabled: mode === "sandbox",
    integrationConfigured: isIntegrationConfigured(),
    ssoConfigured: isSsoConfigured(),
    provider: mode === "sandbox" ? "emis_sandbox" : "unconfigured",
    providerConfigured: mode === "sandbox",
    paymentInitiationEnabled: mode === "sandbox",
    bankTransferSupported: true,
    sigaUrl: getSigaBaseUrl(),
  } as const;
}
