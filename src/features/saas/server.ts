import { createServerFn } from "@tanstack/react-start";
import { loadSgaAdminClient, resolveSgaMembershipAdmin } from "@/integrations/supabase/sga-admin";
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
import {
  fetchTenantByHostname,
  fetchTenantBySlug,
  fetchTenantBySchoolId,
  checkSlugAvailability,
} from "@/features/saas/tenant-lookup";
import { requirePlatformAdmin, requireTenantAccess } from "@/features/saas/platform-guard";
import { fetchActivePlans } from "@/features/saas/catalog";
import { fetchAllTenants, fetchSaaSStats, updateTenantStatus } from "@/features/saas/platform-ops";
import { runPublicSchoolSignup } from "@/features/saas/public-signup";
import type { Plan, SaaSStats, Tenant } from "@/features/saas/types";

// Sem re-export de `requirePlatformAdmin`: um `export … from` é uma ligação de
// topo que o plugin do Start não consegue eliminar do bundle do cliente, e
// arrastava platform-guard → sga-admin (cliente service-role) para o grafo do
// browser — o que fazia a app inteira falhar a hidratar por import-protection.
// Quem precisa do guard importa-o directamente de "@/features/saas/platform-guard".

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

/**
 * Tenant da escola do utilizador autenticado, quando o hostname não chega.
 *
 * O desenho é resolver a escola pelo subdomínio, via wildcard
 * `*.PLATFORM_DOMAIN`. Enquanto esse registo DNS não existir, os subdomínios
 * das escolas não resolvem e o único host alcançável é `app.PLATFORM_DOMAIN` —
 * que é reservado e não corresponde a nenhuma entrada em `tenant_domains`.
 * Resultado: quem tem escola atribuída entra e não vê instituição nenhuma.
 *
 * Isto dá a essas contas um caminho que funciona sem depender de DNS. Não
 * enfraquece o isolamento: a escola vem da membership resolvida no servidor a
 * partir da sessão, exactamente como em todas as outras leituras.
 */
export const getTenantForCurrentUser = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Tenant | null> => {
    if (!context?.userId) return null;
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership?.schoolId) return null;
    return fetchTenantBySchoolId(membership.schoolId);
  });

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

import {
  getSchoolDomainStatus,
  requestCustomDomainVerification,
  saveEmailForwardingRoute,
} from "@/features/saas/school-domain-ops";
import { z } from "zod";

/**
 * Estado completo de identidade digital da escola autenticada:
 * subdomínio, domínio personalizado e rota de e-mail.
 */
export const getSchoolDomain = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ tenantId: z.string(), tenantSlug: z.string() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Unauthorized");
    const tenant = await requireTenantAccess(context.userId, data.tenantId, [
      "Administrador",
      "Secretaria",
    ]);
    return getSchoolDomainStatus(tenant.tenantId, tenant.tenantSlug);
  });

/**
 * Regista um pedido de verificação de domínio personalizado.
 * Retorna as instruções CNAME/TXT que a escola deve configurar no seu DNS.
 */
export const requestDomainVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        tenantId: z.string().uuid(),
        tenantSlug: z.string().min(2),
        hostname: z
          .string()
          .min(4)
          .regex(
            /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/,
            "Hostname inválido.",
          ),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Unauthorized");
    const tenant = await requireTenantAccess(context.userId, data.tenantId);
    return requestCustomDomainVerification({
      ...data,
      tenantId: tenant.tenantId,
      tenantSlug: tenant.tenantSlug,
    });
  });

/**
 * Guarda o endereço de encaminhamento de e-mail institucional.
 */
export const updateEmailForwarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        tenantId: z.string().uuid(),
        tenantSlug: z.string().min(2),
        forwardTo: z.string().email("E-mail de encaminhamento inválido."),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Unauthorized");
    const tenant = await requireTenantAccess(context.userId, data.tenantId);
    return saveEmailForwardingRoute({
      ...data,
      tenantId: tenant.tenantId,
      tenantSlug: tenant.tenantSlug,
    });
  });

import { createMailbox } from "@/features/saas/mailbox-providers";
import { buildInstitutionalAddress } from "@/features/saas/email-routing";
import { saveSchoolBranding } from "@/features/saas/school-domain-ops";

/**
 * Guarda a personalização visual (Fase 6) do portal
 */
export const updateSchoolBranding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        tenantId: z.string().uuid(),
        primaryColor: z.string().optional(),
        secondaryColor: z.string().optional(),
        portalTitle: z.string().optional(),
        logoUrl: z.string().optional(),
        faviconUrl: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Unauthorized");
    const tenant = await requireTenantAccess(context.userId, data.tenantId);
    return saveSchoolBranding({ ...data, tenantId: tenant.tenantId });
  });

/**
 * Provisiona uma nova caixa de e-mail profissional via Zoho/Google Workspace
 * para o tenant actual (Fase 5).
 */
export const provisionMailbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        tenantId: z.string().uuid(),
        tenantSlug: z.string().min(2),
        email: z.string().email(),
        displayName: z.string().min(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Unauthorized");
    const tenant = await requireTenantAccess(context.userId, data.tenantId);

    // O endereço é derivado do slug do tenant, nunca aceite do cliente: caso
    // contrário provisionava-se uma caixa no domínio de outra escola.
    const email = buildInstitutionalAddress(tenant.tenantSlug);
    const result = await createMailbox({
      tenantId: tenant.tenantId,
      tenantSlug: tenant.tenantSlug,
      email,
      displayName: data.displayName,
    });
    if (!result.ok) throw new Error(result.reason);

    const db = await loadSgaAdminClient();
    await db.from("tenant_mailboxes").insert({
      tenant_id: tenant.tenantId,
      email,
      display_name: data.displayName,
      provider: result.provider,
      provider_account_id: result.providerAccountId,
      status: "active",
    });

    return { ok: true, provider: result.provider };
  });
