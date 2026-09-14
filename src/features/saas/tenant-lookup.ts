import { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import type { Tenant } from "@/features/saas/types";
import { validateTenantSlug, isReservedSubdomain } from "@/lib/saas/platform-domain";

/**
 * Colunas devolvidas na resolução de tenant por slug ou hostname.
 *
 * Estas duas funções são alcançáveis **sem sessão** — a página de login precisa
 * de resolver a escola pelo hostname antes de haver utilizador. Por isso não
 * podem devolver `*`: as colunas `contact_name`, `contact_phone` e
 * `contact_email` são dados pessoais do responsável da instituição e sair daqui
 * significaria expô-los a quem souber o subdomínio da escola, que é público.
 * Quem precisa deles (o painel de definições, o ADMIN) lê-os por vias
 * autenticadas.
 */
const PUBLIC_TENANT_SELECT =
  "id, name, slug, status, plan_id, subscription_status, trial_ends_at, max_students, max_storage_gb, created_at, updated_at, plans(*), tenant_usage(active_students_count)" as const;

function mapTenantRow(tenant: Record<string, unknown>): Tenant {
  const usage = tenant.tenant_usage as
    { active_students_count?: number }[] | { active_students_count?: number } | undefined;
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
    .select(PUBLIC_TENANT_SELECT)
    .eq("slug", slug.trim().toLowerCase())
    .maybeSingle();
  if (error) throw publicDatabaseError(error, "Não foi possível carregar a instituição.");
  if (!tenant) return null;
  return mapTenantRow(tenant as Record<string, unknown>);
}

/**
 * Resolve o tenant a partir da escola do utilizador autenticado.
 *
 * Existe porque o hostname nem sempre chega para resolver a escola: o wildcard
 * `*.PLATFORM_DOMAIN` é o que devia fazer `escola.portal-siga.com` funcionar, e
 * enquanto não estiver configurado esses subdomínios não resolvem. Sem isto, um
 * utilizador com escola atribuída entra por `app.PLATFORM_DOMAIN` e não vê
 * instituição nenhuma — o hostname é reservado, não corresponde a nenhum
 * `tenant_domains`, e a resolução devolve null.
 *
 * O isolamento não é afectado: a escola vem da membership resolvida no
 * servidor, não de nada que o cliente possa influenciar. Devolve a mesma
 * projecção pública, porque o resultado chega ao browser.
 */
export async function fetchTenantBySchoolId(schoolId: string): Promise<Tenant | null> {
  if (!schoolId) return null;
  const db = await loadSgaAdminClient();

  const { data: school, error: schoolError } = await db
    .from("schools")
    .select("tenant_id")
    .eq("id", schoolId)
    .maybeSingle();
  if (schoolError) throw publicDatabaseError(schoolError, "Não foi possível resolver a escola.");
  if (!school?.tenant_id) return null;

  const { data: tenant, error } = await db
    .from("tenants")
    .select(PUBLIC_TENANT_SELECT)
    .eq("id", school.tenant_id)
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
    .select(PUBLIC_TENANT_SELECT)
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
        message:
          "Não foi possível confirmar a disponibilidade deste endereço agora. Tente novamente.",
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
      message:
        "Não foi possível confirmar a disponibilidade deste endereço agora. Tente novamente.",
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
