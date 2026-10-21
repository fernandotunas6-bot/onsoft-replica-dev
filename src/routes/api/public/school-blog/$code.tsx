import { createFileRoute } from "@tanstack/react-router";
import { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { getTenantAccessBlock } from "@/features/saas/tenant-access";
import {
  readWebsiteState,
  WEBSITE_DOMAIN,
  websiteOrigin,
} from "@/features/school-website/content-model";
import { loadPublishedSchoolBlog } from "@/features/school-website/blog-server";
import { createSchoolBlogHandler } from "@/features/school-website/blog-http";
import { schoolWebStorageReady } from "@/features/school-website/storage-guard";

// style-check: route-exempt — apenas publicações do blog da escola, sem autenticação pública.
const handle = createSchoolBlogHandler({
  posts: loadPublishedSchoolBlog,
  resolve: async (code) => {
    const db = await loadSgaAdminClient();
    if (!(await schoolWebStorageReady(db))) return null;
    const school = await db
      .from("schools")
      .select("id, status, tenant_id")
      .eq("public_code", code)
      .maybeSingle();
    if (school.error) throw new Error("School lookup failed");
    if (!school.data || school.data.status === "archived") return null;
    const origins: string[] = [];
    if (school.data.tenant_id) {
      const [tenant, domains] = await Promise.all([
        db
          .from("tenants")
          .select("status, subscription_status, trial_ends_at, billing_exempt")
          .eq("id", school.data.tenant_id)
          .single(),
        db
          .from("tenant_domains")
          .select("hostname, status, type, verified_at")
          .eq("tenant_id", school.data.tenant_id)
          .eq("status", "active"),
      ]);
      if (tenant.error || domains.error) throw new Error("Tenant lookup failed");
      if (getTenantAccessBlock(tenant.data as Parameters<typeof getTenantAccessBlock>[0]).blocked)
        return null;
      for (const domain of domains.data)
        if (domain.type === "siga_subdomain" || domain.verified_at)
          origins.push(`https://${domain.hostname}`);
    }
    const settings = await db
      .from("school_settings")
      .select("value")
      .eq("school_id", school.data.id)
      .eq("domain", WEBSITE_DOMAIN)
      .maybeSingle();
    if (settings.error) throw new Error("Website lookup failed");
    const external = websiteOrigin(
      readWebsiteState(settings.data?.value).published?.content.websiteUrl ?? "",
    );
    if (external) origins.push(external);
    return { schoolId: school.data.id, origins };
  },
});
export const Route = createFileRoute("/api/public/school-blog/$code")({
  server: {
    handlers: {
      GET: ({ request, params }) => handle(request, params.code),
      OPTIONS: ({ request, params }) => handle(request, params.code),
    },
  },
});
