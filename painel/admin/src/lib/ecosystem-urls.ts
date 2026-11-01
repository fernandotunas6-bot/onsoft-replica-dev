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

/**
 * SIGA de uma escola: `<slug>.PLATFORM_DOMAIN`, a mesma regra do resolver do
 * SIGA (`getPlatformSubdomain`). Antes tirava o primeiro rótulo do host do
 * SIGA; com o SIGA na raiz (`portal-siga.com`) isso dava `escola.com`.
 */
export function getSigaSchoolUrl(slug?: string): string {
  const clean = (slug ?? "").trim().toLowerCase();
  if (!clean || isLocal || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(clean)) {
    return ECOSYSTEM_URLS.siga;
  }
  return `https://${clean}.${PLATFORM_DOMAIN}`;
}

function validSlug(slug?: string): string | null {
  const clean = (slug ?? "").trim().toLowerCase();
  return clean && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(clean) ? clean : null;
}

/**
 * Website público da escola. No subdomínio, a raiz é o website (o Worker do
 * SIGA serve-o antes do router — `schoolSiteRequest`); em desenvolvimento,
 * o caminho partilhado `/escolas/<slug>/` do SIGA local.
 */
export function getSchoolWebsiteUrl(slug?: string): string | null {
  const clean = validSlug(slug);
  if (!clean) return null;
  if (isLocal) return `${ECOSYSTEM_URLS.siga}/escolas/${clean}/`;
  return `${getSigaSchoolUrl(clean)}/`;
}

/** Portal SIGA Plus da escola (entrada da equipa, alunos e encarregados). */
export function getSchoolPortalUrl(slug?: string): string {
  const clean = validSlug(slug);
  if (!clean) return `${ECOSYSTEM_URLS.siga}/portal`;
  const origin = isLocal ? ECOSYSTEM_URLS.siga : getSigaSchoolUrl(clean);
  return `${origin}/portal?escola=${encodeURIComponent(clean)}`;
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
