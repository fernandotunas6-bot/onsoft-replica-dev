/**
 * URLs do ecossistema. Sem hardcode de produção.
 */
export const ECOSYSTEM_URLS = {
  web: import.meta.env.VITE_WEB_URL || "http://localhost:5174",
  siga: import.meta.env.VITE_SIGA_URL || "http://localhost:3006",
  admin: import.meta.env.VITE_ADMIN_URL || "http://localhost:3005",
  docs: import.meta.env.VITE_DOCS_URL || "http://localhost:5173",
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
