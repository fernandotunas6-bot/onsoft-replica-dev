import { createServerFn } from "@tanstack/react-start";
import { getRequestIP } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import {
  createSchoolWizardInputSchema,
  publicSchoolSignupInputSchema,
  tenantSlugInputSchema,
  updateTenantStatusInputSchema,
} from "@/features/saas/schemas";
import { provisionTenantCore } from "@/features/saas/provisioning-core";
import type { Plan, SaaSStats, Tenant } from "@/features/saas/types";

/**
 * Trava anti-abuso do signup público (rate limit em memória, por processo).
 * Suficiente para um único servidor; se a app passar a correr em várias
 * instâncias, isto precisa de mover para uma tabela/KV partilhado.
 */
const SIGNUP_RATE_WINDOW_MS = 60 * 60 * 1000;
const SIGNUP_RATE_MAX_PER_KEY = 3;
const signupAttempts = new Map<string, number[]>();

function checkSignupRateLimit(...keys: string[]): boolean {
  const now = Date.now();
  return keys.every((key) => {
    const attempts = (signupAttempts.get(key) ?? []).filter((t) => now - t < SIGNUP_RATE_WINDOW_MS);
    return attempts.length < SIGNUP_RATE_MAX_PER_KEY;
  });
}

function recordSignupAttempt(...keys: string[]): void {
  const now = Date.now();
  for (const key of keys) {
    const attempts = (signupAttempts.get(key) ?? []).filter((t) => now - t < SIGNUP_RATE_WINDOW_MS);
    attempts.push(now);
    signupAttempts.set(key, attempts);
  }
}

/**
 * "Administrador da plataforma" é um conceito à parte de `profiles.cargo`
 * (que é sempre por-escola). Vive em `platform_admins`, criada por
 * supabase/APPLY_SAAS_PLATFORM.sql.
 */
export async function requirePlatformAdmin(userId: string): Promise<void> {
  const db = await loadSgaAdminClient();
  const { data, error } = await db
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw publicDatabaseError(error, "Não foi possível confirmar acesso à plataforma.");
  if (!data) throw new Error("Sem permissão de administrador da plataforma.");
}

/**
 * Resolve o tenant pelo slug do subdomínio para branding/estado da
 * subscrição (usado por TenantProvider em __root.tsx, em toda a app,
 * incluindo antes do login). Por isso não tem `requireSupabaseAuth` nem
 * `requirePlatformAdmin` — é a única leitura de `tenants` que fica pública,
 * e só devolve os campos já expostos no dashboard de qualquer forma. RLS
 * continua a bloquear o acesso directo pela chave anon/publishable.
 */
export const getTenantBySlug = createServerFn({ method: "GET" })
  .validator((input: unknown) => tenantSlugInputSchema.parse(input))
  .handler(async ({ data }): Promise<Tenant | null> => {
    const db = await loadSgaAdminClient();
    const { data: tenant, error } = await db
      .from("tenants")
      .select("*, plans(*)")
      .eq("slug", data.slug)
      .maybeSingle();
    if (error) throw publicDatabaseError(error, "Não foi possível carregar a instituição.");
    return (tenant as unknown as Tenant) ?? null;
  });

/**
 * Catálogo de planos e preços — público (usado na página de preços da
 * landing e no passo "Plano" do wizard interno), para nenhum dos dois
 * lados repetir os valores em texto fixo no componente.
 */
export const listPlans = createServerFn({ method: "GET" }).handler(async (): Promise<Plan[]> => {
  const db = await loadSgaAdminClient();
  const { data, error } = await db
    .from("plans")
    .select("*")
    .eq("is_active", true)
    .order("price_aoa_monthly", { ascending: true });
  if (error) throw publicDatabaseError(error, "Não foi possível carregar os planos.");
  return (data as unknown as Plan[]) ?? [];
});

export const getIsPlatformAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!context) return { isPlatformAdmin: false };
    try {
      await requirePlatformAdmin(context.userId);
      return { isPlatformAdmin: true };
    } catch {
      return { isPlatformAdmin: false };
    }
  });

export const getSaaSStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SaaSStats> => {
    if (!context) throw new Error("Unauthorized");
    await requirePlatformAdmin(context.userId);
    const db = await loadSgaAdminClient();

    const { data: tenants, error: tenantErr } = await db
      .from("tenants")
      .select("id, status, plan_id, max_students, max_storage_gb, plans(price_aoa_monthly)");
    if (tenantErr) throw publicDatabaseError(tenantErr, "Não foi possível carregar as escolas.");

    const stats: SaaSStats = {
      totalTenants: tenants?.length ?? 0,
      activeTenants: tenants?.filter((t) => t.status === "active").length ?? 0,
      trialTenants: tenants?.filter((t) => t.status === "trial").length ?? 0,
      suspendedTenants:
        tenants?.filter((t) => t.status === "suspended" || t.status === "past_due").length ?? 0,
      totalStudents: 0,
      mrrAoa: 0,
      arrAoa: 0,
      totalStorageGb: 0,
    };

    for (const t of tenants ?? []) {
      stats.totalStorageGb += t.max_storage_gb || 10;
      const plan = t.plans as unknown as { price_aoa_monthly?: number } | undefined;
      if (plan && (t.status === "active" || t.status === "trial")) {
        stats.mrrAoa += Number(plan.price_aoa_monthly || 0);
      }
    }
    stats.arrAoa = stats.mrrAoa * 12;

    const { count: studentCount } = await db
      .from("students")
      .select("*", { count: "exact", head: true });
    stats.totalStudents = studentCount ?? 0;

    return stats;
  });

export const listTenants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Tenant[]> => {
    if (!context) throw new Error("Unauthorized");
    await requirePlatformAdmin(context.userId);
    const db = await loadSgaAdminClient();
    const { data, error } = await db
      .from("tenants")
      .select("*, plans(*)")
      .order("created_at", { ascending: false });
    if (error) throw publicDatabaseError(error, "Não foi possível carregar as escolas.");
    return (data as unknown as Tenant[]) ?? [];
  });

export const updateTenantStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => updateTenantStatusInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Unauthorized");
    await requirePlatformAdmin(context.userId);
    const db = await loadSgaAdminClient();
    const { error } = await db
      .from("tenants")
      .update({ status: data.status, updated_at: new Date().toISOString() })
      .eq("id", data.tenantId);
    if (error) throw publicDatabaseError(error, "Não foi possível atualizar o estado da escola.");
    await db.from("saas_audit_logs").insert({
      tenant_id: data.tenantId,
      user_id: context.userId,
      action: "TENANT_STATUS_CHANGED",
      entity: "tenant",
      entity_id: data.tenantId,
      metadata: { status: data.status },
    });
    return { success: true };
  });

export const provisionSchoolTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => createSchoolWizardInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Unauthorized");
    await requirePlatformAdmin(context.userId);
    return provisionTenantCore(data, { auditUserId: context.userId, source: "platform_admin" });
  });

/**
 * Signup público da landing: qualquer visitante pode criar a sua escola,
 * sem sessão nem convite prévio. Duas travas específicas deste caminho que
 * o wizard interno (atrás de `requirePlatformAdmin`) não precisa:
 * - `trial_days` fixo em 14, nunca decidido pelo cliente;
 * - rate limit por IP e por e-mail (ver `checkSignupRateLimit` acima) —
 *   o honeypot `website` já é filtrado antes disto, na validação do schema.
 */
export const signupSchoolPublic = createServerFn({ method: "POST" })
  .validator((input: unknown) => publicSchoolSignupInputSchema.parse(input))
  .handler(async ({ data }) => {
    const { website: _honeypot, ...wizardData } = data;
    const ip = getRequestIP({ xForwardedFor: true }) ?? "unknown";
    const emailKey = wizardData.contact_email.trim().toLowerCase();
    const rateLimitKeys = [`ip:${ip}`, `email:${emailKey}`];
    if (!checkSignupRateLimit(...rateLimitKeys)) {
      throw new Error(
        "Muitos pedidos recentes a partir deste e-mail/IP. Tente novamente daqui a algumas horas.",
      );
    }
    recordSignupAttempt(...rateLimitKeys);

    return provisionTenantCore(
      { ...wizardData, trial_days: 14 },
      { auditUserId: null, source: "public_signup" },
    );
  });
