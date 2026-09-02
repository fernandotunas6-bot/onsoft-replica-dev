import { ECOSYSTEM_URLS } from "@/lib/ecosystem-urls";

export type EcosystemApp = keyof typeof ECOSYSTEM_URLS;

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

const PRODUCTION_ORIGINS: string[] = [
  "https://portal-siga.com",
  "https://www.portal-siga.com",
  "https://admin.portal-siga.com",
  "https://docs.portal-siga.com",
  "https://siga-web.pages.dev",
  "https://siga-admin.pages.dev",
  "https://siga-docs.pages.dev",
];

export function getEcosystemOrigins(apps?: EcosystemApp[]): string[] {
  const keys = apps ?? (Object.keys(ECOSYSTEM_URLS) as EcosystemApp[]);
  const origins = keys
    .map((key) => originOf(ECOSYSTEM_URLS[key]))
    .filter((origin): origin is string => Boolean(origin));
  const aliases = origins.flatMap((origin) => [
    origin.replace("localhost", "127.0.0.1"),
    origin.replace("127.0.0.1", "localhost"),
  ]);
  return [...new Set([...origins, ...aliases, ...PRODUCTION_ORIGINS])];
}

export function isAllowedEcosystemOrigin(
  origin: string | null | undefined,
  apps?: EcosystemApp[],
): boolean {
  if (!origin) return false;
  if (getEcosystemOrigins(apps).includes(origin)) return true;

  try {
    const url = new URL(origin);

    // Tenant portals are allowed only on the controlled platform domain.
    // Cloudflare preview domains are intentionally NOT wildcarded: only the
    // explicit projects listed in PRODUCTION_ORIGINS may call these endpoints.
    if (url.protocol === "https:" && url.hostname.endsWith(".portal-siga.com")) {
      return true;
    }
  } catch {
    /* ignore invalid origin */
  }

  return false;
}

export function corsHeadersFor(
  request: Request,
  apps: EcosystemApp[] = ["web", "admin", "siga", "docs"],
): Headers {
  const headers = new Headers();
  const origin = request.headers.get("Origin");
  if (origin && isAllowedEcosystemOrigin(origin, apps)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
    headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    headers.set("Access-Control-Max-Age", "86400");
  }
  return headers;
}

export function jsonWithCors(
  request: Request,
  body: unknown,
  init: { status?: number; apps?: EcosystemApp[] } = {},
): Response {
  const headers = corsHeadersFor(request, init.apps);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { status: init.status ?? 200, headers });
}

export function corsPreflight(
  request: Request,
  apps: EcosystemApp[] = ["web", "admin", "siga", "docs"],
): Response {
  return new Response(null, { status: 204, headers: corsHeadersFor(request, apps) });
}
