import { createServerFn } from "@tanstack/react-start";
import { getRequestIP } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  createSchoolWizardInputSchema,
  publicSchoolSignupInputSchema,
  tenantHostnameInputSchema,
  tenantSlugInputSchema,
  updateTenantStatusInputSchema,
} from "@/features/saas/schemas";
import { provisionTenantCore } from "@/features/saas/provisioning-core";
import { fetchTenantByHostname, fetchTenantBySlug, checkSlugAvailability } from "@/features/saas/tenant-lookup";
import { requirePlatformAdmin } from "@/features/saas/platform-guard";
import { fetchActivePlans } from "@/features/saas/catalog";
import { fetchAllTenants, fetchSaaSStats, updateTenantStatus } from "@/features/saas/platform-ops";
import { runPublicSchoolSignup } from "@/features/saas/public-signup";
import type { Plan, SaaSStats, Tenant } from "@/features/saas/types";

export { requirePlatformAdmin } from "@/features/saas/platform-guard";

/**
 * Verifica se um slug pretendido para subdomínio está disponível para registo.
 * Usado pelo wizard de onboarding em tempo real.
 */
export const checkTenantSlug = createServerFn({ method: "GET" })
  .validator((input: unknown) => tenantSlugInputSchema.parse(input))
  .handler(async ({ data }) => checkSlugAvailability(data.slug));

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
  .handler(async ({ data }): Promise<Tenant | null> => fetchTenantBySlug(data.slug));

/**
 * Resolve o tenant por hostname customizado (tenant_domains.status = active).
 * Usado quando a escola acede via domínio próprio em vez de *.portal-siga.com.
 */
export const getTenantByHostname = createServerFn({ method: "GET" })
  .validator((input: unknown) => tenantHostnameInputSchema.parse(input))
  .handler(async ({ data }): Promise<Tenant | null> => fetchTenantByHostname(data.hostname));

export const listPlans = createServerFn({ method: "GET" }).handler(async (): Promise<Plan[]> => {
  return fetchActivePlans();
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
    return fetchSaaSStats();
  });

export const listTenants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Tenant[]> => {
    if (!context) throw new Error("Unauthorized");
    await requirePlatformAdmin(context.userId);
    return fetchAllTenants();
  });

export const updateTenantStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => updateTenantStatusInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Unauthorized");
    await requirePlatformAdmin(context.userId);
    return updateTenantStatus({ ...data, userId: context.userId });
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
 * sem sessão nem convite prévio. UI destino: WEB `/start`.
 */
export const signupSchoolPublic = createServerFn({ method: "POST" })
  .validator((input: unknown) => publicSchoolSignupInputSchema.parse(input))
  .handler(async ({ data }) => {
    const ip = getRequestIP({ xForwardedFor: true }) ?? "unknown";
    return runPublicSchoolSignup(data, ip);
  });

// ─── Identidade Digital — Fase 3 & 4 ────────────────────────────────────────

import { getSchoolDomainStatus, requestCustomDomainVerification, saveEmailForwardingRoute } from "@/features/saas/school-domain-ops";
import { z } from "zod";

/**
 * Estado completo de identidade digital da escola autenticada:
 * subdomínio, domínio personalizado e rota de e-mail.
 */
export const getSchoolDomain = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ tenantId: z.string(), tenantSlug: z.string() }).parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Unauthorized");
    return getSchoolDomainStatus(data.tenantId, data.tenantSlug);
  });

/**
 * Regista um pedido de verificação de domínio personalizado.
 * Retorna as instruções CNAME/TXT que a escola deve configurar no seu DNS.
 */
export const requestDomainVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({
      tenantId: z.string().uuid(),
      tenantSlug: z.string().min(2),
      hostname: z
        .string()
        .min(4)
        .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/, "Hostname inválido."),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Unauthorized");
    return requestCustomDomainVerification(data);
  });

/**
 * Guarda o endereço de encaminhamento de e-mail institucional.
 */
export const updateEmailForwarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({
      tenantId: z.string().uuid(),
      tenantSlug: z.string().min(2),
      forwardTo: z.string().email("E-mail de encaminhamento inválido."),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Unauthorized");
    return saveEmailForwardingRoute(data);
  });
