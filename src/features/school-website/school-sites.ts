import { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { getTenantAccessBlock } from "@/features/saas/tenant-access";
import {
  getPlatformDomain,
  LEGACY_PLATFORM_DOMAIN,
  isReservedSubdomain,
  validateTenantSlug,
} from "@/lib/saas/platform-domain";
import { getSigaLoginUrl } from "@/lib/ecosystem-urls";
import { readWebsiteState, WEBSITE_DOMAIN, type WebsiteState } from "./content-model";
import { schoolWebStorageReady } from "./storage-guard";

type Db = Awaited<ReturnType<typeof loadSgaAdminClient>>;
export type SchoolSite = {
  schoolId: string;
  publicCode: string;
  name: string;
  logoUrl: string | null;
  slug: string;
  origin: string;
  basePath: string;
  homePath: string;
  portalUrl: string;
  allowedOrigins: string[];
  state: WebsiteState;
};
export function schoolSiteRequest(url: URL) {
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  let configuredHost = "";
  try {
    configuredHost = new URL(getSigaLoginUrl()).hostname;
  } catch {
    /* Invalid deployment config grants no extra host. */
  }
  const centralHosts = [
    configuredHost,
    getPlatformDomain(),
    `app.${getPlatformDomain()}`,
    LEGACY_PLATFORM_DOMAIN,
    `app.${LEGACY_PLATFORM_DOMAIN}`,
    "localhost",
    "127.0.0.1",
  ];
  const shared = url.pathname.match(/^\/escolas\/([^/]+)(\/.*)?$/);
  if (shared) {
    if (!centralHosts.includes(host) || !validateTenantSlug(shared[1]).valid) return null;
    return {
      mode: "slug" as const,
      value: shared[1],
      basePath: `/escolas/${shared[1]}`,
      page: shared[2] || "/",
    };
  }
  if (centralHosts.includes(host)) return null;
  for (const base of new Set([getPlatformDomain(), LEGACY_PLATFORM_DOMAIN])) {
    if (!host.endsWith(`.${base}`)) continue;
    const label = host.slice(0, -(base.length + 1));
    if (isReservedSubdomain(label) || !validateTenantSlug(label).valid) return null;
  }
  if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(host) || !host.includes(".")) return null;
  const page =
    url.pathname === "/"
      ? "/"
      : url.pathname.startsWith("/site/")
        ? url.pathname.slice(5)
        : url.pathname === "/site"
          ? "/"
          : /^\/blog(?:\/|$)/.test(url.pathname)
            ? url.pathname
            : null;
  return page === null ? null : { mode: "hostname" as const, value: host, basePath: "/site", page };
}
export async function schoolSiteLinks(db: Db, schoolId: string) {
  const school = await db.from("schools").select("tenant_id").eq("id", schoolId).single();
  if (school.error) throw new Error("Não foi possível ler o endereço da escola.");
  if (!school.data.tenant_id) return null;
  const [tenant, domains] = await Promise.all([
    db.from("tenants").select("slug").eq("id", school.data.tenant_id).single(),
    db
      .from("tenant_domains")
      .select("hostname, type, status, verified_at")
      .eq("tenant_id", school.data.tenant_id)
      .order("created_at", { ascending: false }),
  ]);
  if (tenant.error || domains.error) throw new Error("Não foi possível ler os domínios da escola.");
  const active = domains.data.filter(
    (d) => d.status === "active" && (d.type === "siga_subdomain" || Boolean(d.verified_at)),
  );
  const primary =
    active.find((d) => d.type === "custom_domain") ??
    active.find((d) => d.type === "siga_subdomain");
  const fallbackUrl = `${getSigaLoginUrl().replace(/\/$/, "")}/escolas/${tenant.data.slug}/`;
  const websiteUrl = primary ? `https://${primary.hostname}/` : fallbackUrl;
  return {
    websiteUrl,
    fallbackUrl,
    portalUrl:
      (primary
        ? `https://${primary.hostname}/portal`
        : `${getSigaLoginUrl().replace(/\/$/, "")}/portal`) +
      `?escola=${encodeURIComponent(tenant.data.slug)}`,
    domains: domains.data,
  };
}

/** Public identity only. Host selection never authorizes a private operation. */
export async function loadSchoolSite(
  request: Request,
): Promise<(SchoolSite & { page: string }) | null> {
  const url = new URL(request.url);
  const selection = schoolSiteRequest(url);
  if (!selection) return null;
  const db = await loadSgaAdminClient();
  let tenantId: string;
  if (selection.mode === "hostname") {
    const domain = await db
      .from("tenant_domains")
      .select("tenant_id, type, verified_at")
      .eq("hostname", selection.value)
      .eq("status", "active")
      .maybeSingle();
    if (domain.error) throw new Error("Domain lookup failed");
    if (!domain.data || (domain.data.type === "custom_domain" && !domain.data.verified_at))
      return null;
    tenantId = domain.data.tenant_id;
  } else {
    const tenant = await db.from("tenants").select("id").eq("slug", selection.value).maybeSingle();
    if (tenant.error) throw new Error("Tenant lookup failed");
    if (!tenant.data) return null;
    tenantId = tenant.data.id;
  }
  const tenant = await db
    .from("tenants")
    .select("slug, status, subscription_status, trial_ends_at, billing_exempt")
    .eq("id", tenantId)
    .single();
  if (tenant.error) throw new Error("Tenant state lookup failed");
  if (getTenantAccessBlock(tenant.data as Parameters<typeof getTenantAccessBlock>[0]).blocked)
    return null;
  const school = await db
    .from("schools")
    .select("id, public_code, name, commercial_name, logo_url, status")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (school.error) throw new Error("School lookup failed");
  if (!school.data || school.data.status === "archived") return null;
  const storageReady = await schoolWebStorageReady(db);
  const [settings, domains] = await Promise.all([
    storageReady
      ? db
          .from("school_settings")
          .select("value")
          .eq("school_id", school.data.id)
          .eq("domain", WEBSITE_DOMAIN)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    db
      .from("tenant_domains")
      .select("hostname, type, status, verified_at")
      .eq("tenant_id", tenantId),
  ]);
  if (settings.error || domains.error) throw new Error("School website lookup failed");
  const origins = domains.data
    .filter((d) => d.status === "active" && (d.type === "siga_subdomain" || d.verified_at))
    .map((d) => `https://${d.hostname}`);
  const homePath = selection.mode === "slug" ? selection.basePath + "/" : "/";
  return {
    schoolId: school.data.id,
    publicCode: school.data.public_code,
    name: school.data.commercial_name || school.data.name,
    logoUrl: school.data.logo_url,
    slug: tenant.data.slug,
    origin: url.origin,
    basePath: selection.basePath,
    homePath,
    portalUrl: url.origin + "/portal?escola=" + encodeURIComponent(tenant.data.slug),
    allowedOrigins: origins,
    state: readWebsiteState(settings.data?.value),
    page: selection.page,
  };
}
