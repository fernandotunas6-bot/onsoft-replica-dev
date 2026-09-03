import { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import type { Tenant } from "@/features/saas/types";
import { validateTenantSlug, isReservedSubdomain } from "@/lib/saas/platform-domain";

function mapTenantRow(tenant: Record<string, unknown>): Tenant {
  const usage = tenant.tenant_usage as
    | { active_students_count?: number }[]
    | { active_students_count?: number }
    | undefined;
  const usageRow = Array.isArray(usage) ? usage[0] : usage;
  return {
    ...(tenant as unknown as Tenant),
    active_students_count: usageRow?.active_students_count ?? 0,
  };
}

export async function fetchTenantBySlug(slug: string): Promise<Tenant | null> {
  const db = await loadSgaAdminClient();
  const { data: tenant, error } = await db
    .from("tenants")
    .select("*, plans(*), tenant_usage(active_students_count)")
    .eq("slug", slug.trim().toLowerCase())
    .maybeSingle();
  if (error) throw publicDatabaseError(error, "Não foi possível carregar a instituição.");
  if (!tenant) return null;
  return mapTenantRow(tenant as Record<string, unknown>);
}

export async function fetchTenantByHostname(hostname: string): Promise<Tenant | null> {
  const db = await loadSgaAdminClient();
  const host = hostname.trim().toLowerCase();
  if (!host) return null;

  const { data: domain, error: domainErr } = await db
    .from("tenant_domains")
    .select("tenant_id")
    .eq("hostname", host)
    .eq("status", "active")
    .maybeSingle();
  if (domainErr) throw publicDatabaseError(domainErr, "Não foi possível resolver o domínio.");
  if (!domain?.tenant_id) return null;

  const { data: tenant, error } = await db
    .from("tenants")
    .select("*, plans(*), tenant_usage(active_students_count)")
    .eq("id", domain.tenant_id)
    .maybeSingle();
  if (error) throw publicDatabaseError(error, "Não foi possível carregar a instituição.");
  if (!tenant) return null;
  return mapTenantRow(tenant as Record<string, unknown>);
}

export interface SlugAvailabilityResult {
  slug: string;
  available: boolean;
  reason?: "invalid" | "reserved" | "taken" | "unavailable" | null;
  message: string;
}

export async function checkSlugAvailability(rawSlug: string): Promise<SlugAvailabilityResult> {
  const slug = (rawSlug || "").trim().toLowerCase();

  const validation = validateTenantSlug(slug);
  if (!validation.valid) {
    const isReserved = isReservedSubdomain(slug);
    return {
      slug,
      available: false,
      reason: isReserved ? "reserved" : "invalid",
      message: validation.reason || "Endereço inválido.",
    };
  }

  try {
    const db = await loadSgaAdminClient();
    const { data: existing, error } = await db
      .from("tenants")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    if (error) {
      return {
        slug,
        available: false,
        reason: "unavailable",
        message: "Não foi possível confirmar a disponibilidade deste endereço agora. Tente novamente.",
      };
    }

    if (existing) {
      return {
        slug,
        available: false,
        reason: "taken",
        message: "Este endereço já está em uso por outra instituição.",
      };
    }

    return {
      slug,
      available: true,
      reason: null,
      message: "Endereço disponível.",
    };
  } catch {
    return {
      slug,
      available: false,
      reason: "unavailable",
      message: "Não foi possível confirmar a disponibilidade deste endereço agora. Tente novamente.",
    };
  }
}

export function publicTenantSummary(tenant: Tenant) {
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    status: tenant.status,
    subscription_status: tenant.subscription_status,
    trial_ends_at: tenant.trial_ends_at ?? null,
  };
}
