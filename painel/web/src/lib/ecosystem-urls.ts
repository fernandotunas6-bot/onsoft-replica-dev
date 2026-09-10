const isBrowser = typeof window !== "undefined";
const isLocal =
  isBrowser &&
  (window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname.startsWith("192.168.") ||
    window.location.hostname.endsWith(".local"));

export const PLATFORM_DOMAIN = String(
  import.meta.env.VITE_PLATFORM_DOMAIN || import.meta.env.PLATFORM_DOMAIN || "portal-siga.com",
)
  .trim()
  .toLowerCase()
  .replace(/^\.+|\.+$/g, "");

function platformOrigin(sub: string): string {
  return `https://${sub}.${PLATFORM_DOMAIN}`;
}

export const ECOSYSTEM_URLS = {
  web: import.meta.env.VITE_WEB_URL || (isLocal ? "http://localhost:5174" : platformOrigin("www")),
  siga: import.meta.env.VITE_SIGA_URL || (isLocal ? "http://localhost:3006" : `https://${PLATFORM_DOMAIN}`),
  admin: import.meta.env.VITE_ADMIN_URL || (isLocal ? "http://localhost:3005" : platformOrigin("admin")),
  docs: import.meta.env.VITE_DOCS_URL || (isLocal ? "http://localhost:5173" : platformOrigin("docs")),
  payflow:
    import.meta.env.VITE_PAYFLOW_URL ||
    (isLocal ? "http://localhost:3007" : platformOrigin("payflow")),
} as const;

export function getSigaLoginUrl(): string {
  return ECOSYSTEM_URLS.siga;
}

export function getCreateSchoolUrl(): string {
  return ECOSYSTEM_URLS.web + "/start";
}

export function getPricingUrl(): string {
  return ECOSYSTEM_URLS.web + "/pricing";
}

export function getDocsUrl(path = "/arquitetura/"): string {
  const clean = path.startsWith("/") ? path : "/" + path;
  return ECOSYSTEM_URLS.docs + clean;
}

export function getSigaUrl(path = "/"): string {
  const clean = path.startsWith("/") ? path : "/" + path;
  return ECOSYSTEM_URLS.siga + clean;
}

export function getAdminTenantsUrl(): string {
  return ECOSYSTEM_URLS.admin + "/tenants";
}

export function getSaasApiUrl(path: string): string {
  const clean = path.startsWith("/") ? path : "/" + path;
  return ECOSYSTEM_URLS.siga + clean;
}

export function getPayflowUrl(path = "/"): string {
  const clean = path.startsWith("/") ? path : "/" + path;
  return ECOSYSTEM_URLS.payflow + clean;
}
