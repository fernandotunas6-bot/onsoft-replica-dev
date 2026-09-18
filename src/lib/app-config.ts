import { getPlatformDomain } from "@/lib/saas/platform-domain";

/**
 * Configuração centralizada da aplicação SIGA Plus.
 *
 * NUNCA espalhar URLs ou nomes fixos hardcoded pelo código.
 * Mudar o domínio ou o nome da plataforma requer alteração APENAS aqui
 * ou nas variáveis de ambiente APP_URL / VITE_APP_URL / APP_NAME / VITE_APP_NAME.
 */

export function getAppUrl(): string {
  const envUrl =
    (typeof process !== "undefined" && (process.env?.APP_URL || process.env?.VITE_APP_URL)) ||
    (typeof import.meta !== "undefined" &&
      (import.meta.env?.VITE_APP_URL || import.meta.env?.APP_URL));

  if (envUrl && typeof envUrl === "string" && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, "");
  }

  const domain = getPlatformDomain();
  return `https://${domain}`;
}

export function getAppName(): string {
  const envName =
    (typeof process !== "undefined" && (process.env?.APP_NAME || process.env?.VITE_APP_NAME)) ||
    (typeof import.meta !== "undefined" &&
      (import.meta.env?.VITE_APP_NAME || import.meta.env?.APP_NAME));

  if (envName && typeof envName === "string" && envName.trim()) {
    return envName.trim();
  }

  return "SIGA Plus";
}

export function getAuthResetPasswordUrl(customOrigin?: string): string {
  const base = customOrigin ? customOrigin.replace(/\/+$/, "") : getAppUrl();
  return `${base}/auth/reset-password`;
}
