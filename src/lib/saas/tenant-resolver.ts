import {
  getPlatformDomain,
  isReservedSubdomain,
  validateTenantSlug,
} from "@/lib/saas/platform-domain";

/**
 * Resolve o tenant activo a partir do hostname (subdomínio da plataforma,
 * domínio customizado ou ambiente local de desenvolvimento).
 */

export type TenantLookup = { mode: "slug"; slug: string } | { mode: "hostname"; hostname: string };

function normalizeHost(hostname?: string): string {
  const raw = hostname || (typeof window !== "undefined" ? window.location.hostname : "");
  return raw.trim().toLowerCase().replace(/\.+$/g, "");
}

export function isLocalDevHostname(hostname?: string): boolean {
  const host = normalizeHost(hostname);
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.startsWith("192.168.") ||
    host.endsWith(".local")
  );
}

export function isPortalSigaHostname(hostname?: string): boolean {
  const host = normalizeHost(hostname);
  const platformDomain = getPlatformDomain();
  return (
    host === platformDomain ||
    host.endsWith(`.${platformDomain}`) ||
    host === "portal-siga.com" ||
    host.endsWith(".portal-siga.com")
  );
}

/**
 * Devolve como resolver o tenant: slug apenas para subdomínios escolares
 * válidos; hostnames de plataforma/reservados são tratados como hostname
 * para evitar mapear silenciosamente para uma escola fictícia.
 */
export function resolveTenantLookup(hostname?: string): TenantLookup {
  const host = normalizeHost(hostname);

  // Sem hostname não há tenant implícito. Falhar fechado é mais seguro do que
  // mapear silenciosamente para uma escola de demonstração.
  if (!host) return { mode: "hostname", hostname: "" };

  // Selecção manual de tenant existe somente em desenvolvimento local.
  if (isLocalDevHostname(host)) {
    if (typeof window !== "undefined") {
      const devSlug = localStorage.getItem("siga_dev_tenant_slug");
      if (devSlug) return { mode: "slug", slug: devSlug };
    }
    return { mode: "slug", slug: "minha-escola" };
  }

  if (isPortalSigaHostname(host)) {
    const platformDomain = getPlatformDomain();

    // O domínio raiz é da plataforma, não de um tenant.
    if (host === platformDomain || host === "portal-siga.com") {
      return { mode: "hostname", hostname: host };
    }

    const suffix = host.endsWith(`.${platformDomain}`)
      ? `.${platformDomain}`
      : host.endsWith(".portal-siga.com")
        ? ".portal-siga.com"
        : null;

    if (suffix) {
      const subdomain = host.slice(0, -suffix.length).toLowerCase();

      // Subdomínios de infraestrutura/plataforma nunca devem ser resolvidos
      // como tenants escolares. Também rejeitamos labels aninhados ou slugs
      // fora do formato canónico para impedir resolução ambígua.
      const slugValidation = validateTenantSlug(subdomain);
      if (
        !subdomain ||
        subdomain.includes(".") ||
        isReservedSubdomain(subdomain) ||
        !slugValidation.valid
      ) {
        return { mode: "hostname", hostname: host };
      }

      return { mode: "slug", slug: subdomain };
    }

    return { mode: "hostname", hostname: host };
  }

  // Domínios personalizados são validados em tenant_domains no servidor.
  return { mode: "hostname", hostname: host };
}

/** @deprecated Prefer resolveTenantLookup — mantido para compatibilidade. */
export function getTenantSlugFromHostname(hostname?: string): string {
  const lookup = resolveTenantLookup(hostname);
  return lookup.mode === "slug" ? lookup.slug : lookup.hostname.split(".")[0] || "minha-escola";
}

export function isAdminSubdomain(hostname?: string): boolean {
  const host = normalizeHost(hostname);
  const platformDomain = getPlatformDomain();
  return (
    host === `admin.${platformDomain}` ||
    host === `saas-admin.${platformDomain}` ||
    host === "admin.portal-siga.com" ||
    host === "saas-admin.portal-siga.com"
  );
}
