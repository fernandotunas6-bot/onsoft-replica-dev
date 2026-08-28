import {
  getSaaSStats as getSaaSStatsFn,
  listTenants as listTenantsFn,
  provisionSchoolTenant as provisionSchoolTenantFn,
  updateTenantStatusFn,
} from "@/features/saas/server";
import type {
  CreateSchoolWizardData,
  Tenant,
  Plan,
  TenantStatus,
  SaaSStats,
} from "@/features/saas/types";

export type { SaaSStats };

const FALLBACK_STATS: SaaSStats = {
  totalTenants: 4,
  activeTenants: 3,
  trialTenants: 1,
  suspendedTenants: 0,
  totalStudents: 1450,
  mrrAoa: 440000,
  arrAoa: 5280000,
  totalStorageGb: 125,
};

const FALLBACK_TENANTS: Tenant[] = [
  {
    id: "ten-001",
    name: "Minha Escola (Tenant Principal)",
    slug: "minha-escola",
    status: "active",
    subscription_status: "active",
    max_students: 750,
    max_storage_gb: 20,
    contact_name: "Direção Geral",
    contact_email: "direcao@portal-siga.com",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    plans: {
      id: "p-2",
      name: "Professional",
      code: "professional",
      description: "Para colégios em crescimento",
      max_students: 750,
      max_staff: 75,
      max_storage_gb: 20,
      price_aoa_monthly: 120000,
      price_aoa_yearly: 1200000,
      features: { academic: true, finance: true, attendance: true, documents: true },
      is_active: true,
    },
  },
  {
    id: "ten-002",
    name: "Colégio Esperança",
    slug: "esperanca",
    status: "active",
    subscription_status: "active",
    max_students: 250,
    max_storage_gb: 5,
    contact_name: "Ana Maria",
    contact_email: "direcao@esperanca.co.ao",
    created_at: new Date(Date.now() - 86400000 * 30).toISOString(),
    updated_at: new Date().toISOString(),
    plans: {
      id: "p-1",
      name: "Start",
      code: "start",
      description: "Plano inicial para pequenas escolas",
      max_students: 250,
      max_staff: 25,
      max_storage_gb: 5,
      price_aoa_monthly: 50000,
      price_aoa_yearly: 500000,
      features: { academic: true, finance: true, attendance: true, documents: true },
      is_active: true,
    },
  },
  {
    id: "ten-003",
    name: "Complexo Escolar Vitória",
    slug: "vitoria",
    status: "trial",
    subscription_status: "trialing",
    max_students: 2000,
    max_storage_gb: 50,
    contact_name: "Dr. Manuel K.",
    contact_email: "geral@vitoria.edu.ao",
    created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
    updated_at: new Date().toISOString(),
    plans: {
      id: "p-3",
      name: "Business",
      code: "business",
      description: "Para grandes instituições de ensino",
      max_students: 2000,
      max_staff: 200,
      max_storage_gb: 50,
      price_aoa_monthly: 250000,
      price_aoa_yearly: 2500000,
      features: { academic: true, finance: true, attendance: true, documents: true },
      is_active: true,
    },
  },
];

/**
 * Estas funções chamam createServerFn do lado do servidor (service role,
 * validado por requirePlatformAdmin em src/features/saas/server.ts) — não
 * fazem mais nenhum acesso directo ao Supabase a partir do browser. O
 * fallback abaixo só entra em jogo antes do SQL/plataforma estarem prontos
 * (tabelas em falta) ou se o utilizador não for administrador da plataforma,
 * para o painel continuar visualmente utilizável durante o desenvolvimento.
 */
export async function fetchSaaSStats(): Promise<SaaSStats> {
  try {
    return await getSaaSStatsFn();
  } catch (err) {
    console.warn("[SaaS Stats] Fallback stats used due to error or offline:", err);
    return FALLBACK_STATS;
  }
}

export async function fetchAllTenants(): Promise<Tenant[]> {
  try {
    return await listTenantsFn();
  } catch (err) {
    console.warn("[SaaS Tenants] Fetch error, returning fallback demo tenants:", err);
    return FALLBACK_TENANTS;
  }
}

export async function createSchoolTenant(
  wizardData: CreateSchoolWizardData,
): Promise<{ success: boolean; tenantId?: string; error?: string }> {
  try {
    const result = await provisionSchoolTenantFn({ data: wizardData });
    return result;
  } catch (err) {
    console.error("[Provisioning Error]:", err);
    const message = err instanceof Error ? err.message : "Erro ao provisionar a nova escola.";
    return { success: false, error: message };
  }
}

export async function updateTenantStatus(tenantId: string, status: string): Promise<boolean> {
  try {
    await updateTenantStatusFn({ data: { tenantId, status: status as TenantStatus } });
    return true;
  } catch (err) {
    console.error("[Update Tenant Status Error]:", err);
    return false;
  }
}

export type { Plan };
