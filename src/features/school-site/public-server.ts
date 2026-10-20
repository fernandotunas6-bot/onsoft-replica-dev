/**
 * Leitura pública por hostname exacto, sem aceitar schoolId/tenantId do cliente.
 * Somente o snapshot publicado é transferido para visitantes.
 */
import { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { getTenantAccessBlock } from "@/features/saas/tenant-access";
import type { TenantStatus, SubscriptionLifecycle } from "@/features/saas/types";
import { parseSchoolSiteSettings, type SchoolSiteContent } from "./schema";
import { schoolSitesEnabled } from "./feature-gate";

export type PublicSchoolSite = {
  schoolName: string;
  contact: { email: string | null; phone: string | null; address: string | null } | null;
  content: SchoolSiteContent;
  publishedAt: string;
};

export async function loadPublishedSchoolSite(hostname: string): Promise<PublicSchoolSite | null> {
  if (!schoolSitesEnabled()) return null;
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!host || host.length > 253 || !/^[a-z0-9.-]+$/.test(host)) return null;
  const db = await loadSgaAdminClient();

  const { data: domain, error: domainError } = await db
    .from("tenant_domains")
    .select("tenant_id")
    .eq("hostname", host)
    .eq("status", "active")
    .maybeSingle();
  if (domainError) throw new Error("Falha ao resolver o domínio institucional.");
  if (!domain) return null;

  const { data: tenant, error: tenantError } = await db
    .from("tenants")
    .select("id, status, subscription_status, trial_ends_at, billing_exempt")
    .eq("id", domain.tenant_id)
    .maybeSingle();
  if (tenantError) throw new Error("Não foi possível verificar a instituição.");
  if (!tenant || (tenant.status !== "active" && tenant.status !== "trial")) return null;
  if (
    getTenantAccessBlock({
      status: tenant.status as TenantStatus,
      subscription_status: tenant.subscription_status as SubscriptionLifecycle,
      trial_ends_at: tenant.trial_ends_at,
      billing_exempt: tenant.billing_exempt,
    }).blocked
  )
    return null;

  const { data: school, error: schoolError } = await db
    .from("schools")
    .select("id, name, status, email, phone, address")
    .eq("tenant_id", tenant.id)
    .maybeSingle();
  if (schoolError) throw new Error("Não foi possível consultar a escola.");
  if (!school || school.status !== "active") return null;

  const { data: row, error: settingsError } = await db
    .from("school_settings")
    .select("version, value")
    .eq("school_id", school.id)
    .eq("domain", "school_website")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (settingsError) throw new Error("Não foi possível consultar o website.");
  if (!row) return null;

  // Falha fechada: schema desconhecido, inválido ou sem publicação não é exposto.
  const published = parseSchoolSiteSettings(row.value);
  if (!published.published || !published.publishedAt) return null;

  return {
    schoolName: school.name,
    content: published.published,
    publishedAt: published.publishedAt,
    contact: published.published.showContact
      ? { email: school.email, phone: school.phone, address: school.address }
      : null,
  };
}
