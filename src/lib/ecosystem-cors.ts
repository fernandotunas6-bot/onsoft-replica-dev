import { ECOSYSTEM_URLS } from "@/lib/ecosystem-urls";

export type EcosystemApp = keyof typeof ECOSYSTEM_URLS;

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function getEcosystemOrigins(apps?: EcosystemApp[]): string[] {
  const keys = apps ?? (Object.keys(ECOSYSTEM_URLS) as EcosystemApp[]);
  const origins = keys
    .map((key) => originOf(ECOSYSTEM_URLS[key]))
    .filter((origin): origin is string => Boolean(origin));
  const aliases = origins.flatMap((origin) => [
    origin.replace("localhost", "127.0.0.1"),
    origin.replace("127.0.0.1", "localhost"),
  ]);
  return [...new Set([...origins, ...aliases])];
}

export function isAllowedEcosystemOrigin(
  origin: string | null | undefined,
  apps?: EcosystemApp[],
): boolean {
  if (!origin) return false;
  return getEcosystemOrigins(apps).includes(origin);
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
