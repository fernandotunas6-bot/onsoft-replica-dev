const isBrowser = typeof window !== "undefined";
const isLocal = isBrowser
  ? window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname.startsWith("192.168.") ||
    window.location.hostname.endsWith(".local")
  : process.env.NODE_ENV !== "production";

/** Domínio canónico; nunca hardcodar hosts fora desta resolução. */
const PLATFORM_DOMAIN = (
  process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ||
  process.env.PLATFORM_DOMAIN ||
  "portal-siga.com"
)
  .trim()
  .toLowerCase()
  .replace(/^\.+|\.+$/g, "");

function platformOrigin(sub: string): string {
  return `https://${sub}.${PLATFORM_DOMAIN}`;
}

export const ECOSYSTEM_URLS = {
  web: process.env.NEXT_PUBLIC_WEB_URL || (isLocal ? "http://localhost:5174" : platformOrigin("www")),
  siga: process.env.NEXT_PUBLIC_SIGA_URL || (isLocal ? "http://localhost:3006" : `https://${PLATFORM_DOMAIN}`),
  payflow:
    process.env.NEXT_PUBLIC_PAYFLOW_URL ||
    (isLocal ? "http://localhost:3007" : platformOrigin("payflow")),
  admin: process.env.NEXT_PUBLIC_ADMIN_URL || (isLocal ? "http://localhost:3005" : platformOrigin("admin")),
  docs: process.env.NEXT_PUBLIC_DOCS_URL || (isLocal ? "http://localhost:5173" : platformOrigin("docs")),
} as const;

export function getCreateSchoolUrl(): string {
  return `${ECOSYSTEM_URLS.web}/start`;
}

export function getSigaSchoolUrl(slug?: string): string {
  if (slug && !ECOSYSTEM_URLS.siga.includes("localhost")) {
    try {
      const host = new URL(ECOSYSTEM_URLS.siga).host.replace(/^[^.]+\./, "");
      return `https://${slug}.${host}`;
    } catch {
      /* fall through */
    }
  }
  return ECOSYSTEM_URLS.siga;
}

export function getSaasApiUrl(path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${ECOSYSTEM_URLS.siga}${clean}`;
}

export function getDocsUrl(path = "/arquitetura/"): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${ECOSYSTEM_URLS.docs}${clean}`;
}

export function getWebUrl(path = "/"): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${ECOSYSTEM_URLS.web}${clean}`;
}

export function getSigaUrl(path = "/"): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${ECOSYSTEM_URLS.siga}${clean}`;
}

export function getPayflowUrl(path = "/"): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${ECOSYSTEM_URLS.payflow}${clean}`;
}

export function getPayflowHealthUrl(): string {
  return getPayflowUrl("/api/v1/health");
}
