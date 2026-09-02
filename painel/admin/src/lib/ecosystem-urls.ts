export const ECOSYSTEM_URLS = {
  web: process.env.NEXT_PUBLIC_WEB_URL || "http://localhost:5174",
  siga: process.env.NEXT_PUBLIC_SIGA_URL || "http://localhost:3006",
  admin: process.env.NEXT_PUBLIC_ADMIN_URL || "http://localhost:3005",
  docs: process.env.NEXT_PUBLIC_DOCS_URL || "http://localhost:5173",
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
