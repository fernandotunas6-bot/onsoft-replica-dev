import { getPlatformDomain, LEGACY_PLATFORM_DOMAIN } from "@/lib/saas/platform-domain";

/**
 * App móvel (PWA professor/aluno) em `m.{{PLATFORM_DOMAIN}}`.
 *
 * O wildcard `*.portal-siga.com` já chega ao Worker do SIGA; este host não é uma
 * escola. Os ficheiros da app ficam em `public/mobile/` (servidos pelos assets
 * da Cloudflare antes do Worker), e o Worker só responde à API Mobile. Assim a
 * chave de servidor fica num só Worker e as chaves de acesso (RP ID
 * portal-siga.com) funcionam neste subdomínio.
 */
export const MOBILE_SUBDOMAIN = "m";
export const MOBILE_BASE_PATH = "/mobile/";
const MOBILE_API_PREFIX = "/api/mobile-v4/";

export function isMobileHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.+$/, "");
  return [getPlatformDomain(), LEGACY_PLATFORM_DOMAIN].some(
    (domain) => host === `${MOBILE_SUBDOMAIN}.${domain}`,
  );
}

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * No host móvel: a API Mobile segue para o servidor; tudo o resto do portal
 * (páginas, server functions, outras APIs) fica fechado. A raiz e caminhos
 * soltos levam à app. Devolve `null` quando o pedido deve seguir.
 */
export function routeMobileHostRequest(request: Request): Response | null {
  const url = new URL(request.url);
  if (url.pathname.startsWith(MOBILE_API_PREFIX)) return null;
  if (
    url.pathname === "/api" ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_serverFn")
  ) {
    return Response.json({ error: "NOT_FOUND" }, { status: 404, headers: NO_STORE });
  }
  // Um ficheiro da app que chegou aqui não existe nos assets.
  if (url.pathname.startsWith(MOBILE_BASE_PATH) && url.pathname !== MOBILE_BASE_PATH) {
    return new Response("Not found", { status: 404, headers: NO_STORE });
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: NO_STORE });
  }
  return new Response(null, {
    status: 302,
    headers: { Location: MOBILE_BASE_PATH, ...NO_STORE },
  });
}
