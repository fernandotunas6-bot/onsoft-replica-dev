import { getPlatformDomain, isReservedSubdomain } from "@/lib/saas/platform-domain";

/**
 * Resolve o tenant activo a partir do hostname (subdomínio portal-siga,
 * domínio customizado ou ambiente local de desenvolvimento).
 */

export type TenantLookup =
  | { mode: "slug"; slug: string }
  | { mode: "hostname"; hostname: string };

function normalizeHost(hostname?: string): string {
  return (hostname || (typeof window !== "undefined" ? window.location.hostname : "")).toLowerCase();
}

export function isLocalDevHostname(hostname?: string): boolean {
  const host = normalizeHost(hostname);
  return host === "localhost" || host === "127.0.0.1" || host.startsWith("192.168.");
}

export function isPortalSigaHostname(hostname?: string): boolean {
  const host = normalizeHost(hostname);
  const platformDomain = getPlatformDomain();
  return host === platformDomain || host.endsWith(`.${platformDomain}`) || host.endsWith(".portal-siga.com");
}

/**
 * Devolve como resolver o tenant: slug (subdomínio ou dev) ou hostname
 * (domínio customizado registado em tenant_domains).
 */
export function resolveTenantLookup(hostname?: string): TenantLookup {
  const host = normalizeHost(hostname);

  if (!host) return { mode: "slug", slug: "minha-escola" };

  if (isLocalDevHostname(host)) {
    if (typeof window !== "undefined") {
      const devSlug = localStorage.getItem("siga_dev_tenant_slug");
      if (devSlug) return { mode: "slug", slug: devSlug };
    }
    return { mode: "slug", slug: "minha-escola" };
  }

  if (isPortalSigaHostname(host)) {
    const platformDomain = getPlatformDomain();
    // Se o host termina com o domínio configurado (ex: .portal-siga.com ou .siga.ao)
    const suffix = host.endsWith(`.${platformDomain}`)
      ? `.${platformDomain}`
      : host.endsWith(".portal-siga.com")
        ? ".portal-siga.com"
        : null;

    if (suffix) {
      const subdomain = host.slice(0, -suffix.length).toLowerCase();
      // Se for subdomínio reservado ou landing/app (ex.: www, app, login) → fallback geral
      if (!subdomain || subdomain === "www" || subdomain === "app" || subdomain === "portal" || subdomain === "web") {
        return { mode: "slug", slug: "minha-escola" };
      }
      return { mode: "slug", slug: subdomain };
    }
  }

  return { mode: "hostname", hostname: host };
}

/** @deprecated Prefer resolveTenantLookup — mantido para compatibilidade. */
export function getTenantSlugFromHostname(hostname?: string): string {
  const lookup = resolveTenantLookup(hostname);
  return lookup.mode === "slug" ? lookup.slug : lookup.hostname.split(".")[0] || "minha-escola";
}

export function isAdminSubdomain(hostname?: string): boolean {
  const lookup = resolveTenantLookup(hostname);
  if (lookup.mode !== "slug") return false;
  return lookup.slug === "admin" || lookup.slug === "saas-admin";
}
