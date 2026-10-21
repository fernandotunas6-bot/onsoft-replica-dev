import { createFileRoute } from "@tanstack/react-router";
import { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { getTenantAccessBlock } from "@/features/saas/tenant-access";
import { readWebsiteState, WEBSITE_DOMAIN } from "@/features/school-website/content-model";
import { createWebsiteContentHandler } from "@/features/school-website/content-http";
import { schoolWebStorageReady } from "@/features/school-website/storage-guard";

// style-check: route-exempt — API pública de conteúdos; sem interface de operação.
const handle = createWebsiteContentHandler(async (code) => {
  const db = await loadSgaAdminClient();
  if (!(await schoolWebStorageReady(db))) return null;
  const { data: school, error } = await db
    .from("schools")
    .select("id, status, tenant_id")
    .eq("public_code", code)
    .maybeSingle();
  if (error) throw new Error("School lookup failed");
  if (!school || school.status === "archived") return null;
  if (school.tenant_id) {
    const tenant = await db
      .from("tenants")
      .select("status, subscription_status, trial_ends_at, billing_exempt")
      .eq("id", school.tenant_id)
      .maybeSingle();
    if (tenant.error) throw new Error("Tenant lookup failed");
    if (
      !tenant.data ||
      getTenantAccessBlock(tenant.data as Parameters<typeof getTenantAccessBlock>[0]).blocked
    )
      return null;
  }
  const settings = await db
    .from("school_settings")
    .select("value")
    .eq("school_id", school.id)
    .eq("domain", WEBSITE_DOMAIN)
    .maybeSingle();
  if (settings.error) throw new Error("Content lookup failed");
  const state = readWebsiteState(settings.data?.value);
  const bindings = state.published?.content.programBindings ?? {};
  const ids = [...new Set(Object.values(bindings))];
  const programNames: Record<string, string | null> = {};
  if (ids.length) {
    const programs = await db
      .from("programs")
      .select("id, name")
      .eq("school_id", school.id)
      .eq("is_active", true)
      .in("id", ids);
    if (programs.error) throw new Error("Program lookup failed");
    const names = new Map((programs.data ?? []).map((program) => [program.id, program.name]));
    for (const [key, id] of Object.entries(bindings)) programNames[key] = names.get(id) ?? null;
  }
  let campaignOpen = false;
  const slug = state.published?.content.campaignSlug;
  if (slug) {
    const campaign = await db
      .from("enrollment_forms")
      .select("is_open")
      .eq("school_id", school.id)
      .eq("slug", slug)
      .maybeSingle();
    if (campaign.error) throw new Error("Campaign lookup failed");
    campaignOpen = campaign.data?.is_open === true;
  }
  let allowedOrigins: string[] = [];
  if (school.tenant_id) {
    const domains = await db
      .from("tenant_domains")
      .select("hostname, type, verified_at")
      .eq("tenant_id", school.tenant_id)
      .eq("status", "active");
    if (domains.error) throw new Error("Domain lookup failed");
    allowedOrigins = domains.data
      .filter((domain) => domain.type === "siga_subdomain" || domain.verified_at)
      .map((domain) => `https://${domain.hostname}`);
  }
  return { state, programNames, campaignOpen, allowedOrigins };
});
export const Route = createFileRoute("/api/public/school-content/$code")({
  server: {
    handlers: {
      GET: ({ request, params }) => handle(request, params.code),
      OPTIONS: ({ request, params }) => handle(request, params.code),
    },
  },
});
