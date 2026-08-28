/**
 * Helper to resolve the active tenant slug from current location hostname or environment.
 */
export function getTenantSlugFromHostname(hostname?: string): string {
  const host = hostname || (typeof window !== "undefined" ? window.location.hostname : "");

  if (!host) return "minha-escola";

  // Handle localhost / IP dev environments
  if (host === "localhost" || host === "127.0.0.1" || host.startsWith("192.168.")) {
    if (typeof window !== "undefined") {
      const devSlug = localStorage.getItem("siga_dev_tenant_slug");
      if (devSlug) return devSlug;
    }
    return "minha-escola";
  }

  // Handle portal-siga.com domain structure
  if (host.endsWith(".portal-siga.com")) {
    const parts = host.split(".");
    if (parts.length >= 3) {
      const subdomain = parts[0]?.toLowerCase();
      if (!subdomain || subdomain === "www" || subdomain === "app") return "minha-escola";
      return subdomain; // Returns e.g. "colegiohorizonte" or "admin"
    }
  }

  // Custom domain scenario fallback
  const firstPart = host.split(".")[0]?.toLowerCase();
  return firstPart || "minha-escola";
}

export function isAdminSubdomain(hostname?: string): boolean {
  const slug = getTenantSlugFromHostname(hostname);
  return slug === "admin" || slug === "saas-admin";
}
