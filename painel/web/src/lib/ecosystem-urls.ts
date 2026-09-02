const isBrowser = typeof window !== "undefined";
const isLocal =
  isBrowser &&
  (window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname.startsWith("192.168.") ||
    window.location.hostname.endsWith(".local"));

export const ECOSYSTEM_URLS = {
  web: import.meta.env.VITE_WEB_URL || (isLocal ? "http://localhost:5174" : "https://siga-web.pages.dev"),
  siga: import.meta.env.VITE_SIGA_URL || (isLocal ? "http://localhost:3006" : "https://portal-siga.com"),
  admin: import.meta.env.VITE_ADMIN_URL || (isLocal ? "http://localhost:3005" : "https://siga-admin.pages.dev"),
  docs: import.meta.env.VITE_DOCS_URL || (isLocal ? "http://localhost:5173" : "https://siga-docs.pages.dev"),
} as const;

export function getSigaLoginUrl(): string {
  return ECOSYSTEM_URLS.siga;
}

export function getCreateSchoolUrl(): string {
  return `${ECOSYSTEM_URLS.web}/start`;
}

export function getPricingUrl(): string {
  return `${ECOSYSTEM_URLS.web}/pricing`;
}

export function getDocsUrl(path = "/arquitetura/"): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${ECOSYSTEM_URLS.docs}${clean}`;
}

export function getSigaUrl(path = "/"): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${ECOSYSTEM_URLS.siga}${clean}`;
}

export function getAdminTenantsUrl(): string {
  return `${ECOSYSTEM_URLS.admin}/tenants`;
}

export function getSaasApiUrl(path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${ECOSYSTEM_URLS.siga}${clean}`;
}
