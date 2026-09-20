import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ResendDomainsClient } from "@/features/integrations/resend-domains-client";
import { loadSgaAdminClient, requireSgaWriter } from "@/integrations/supabase/sga-admin";

export const listResendDomainsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireSgaWriter(context.supabase, context.userId, ["Administrador"]);
    try {
      const domains = await ResendDomainsClient.listDomains();
      return {
        success: true,
        domains: domains.map((d) => {
          const spfRecord = d.records?.find((r) => r.record === "SPF");
          const dkimRecord = d.records?.find((r) => r.record === "DKIM");
          return {
            id: d.id,
            name: d.name,
            status: d.status,
            createdAt: d.created_at,
            region: d.region,
            spfStatus: spfRecord?.status || "not_started",
            dkimStatus: dkimRecord?.status || "not_started",
          };
        }),
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || "Erro ao consultar domínios no Resend.",
        domains: [],
      };
    }
  });

export const verifyResendDomainInputSchema = z.object({
  domainId: z.string().min(1, "ID do domínio é obrigatório."),
});

export const verifyResendDomainFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => verifyResendDomainInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireSgaWriter(context.supabase, context.userId, ["Administrador"]);
    try {
      const result = await ResendDomainsClient.verifyDomain(data.domainId);
      return {
        success: result.success,
        message: result.success
          ? "Verificação solicitada com sucesso. Os registos DNS serão validados em minutos."
          : "Não foi possível validar o domínio no Resend.",
      };
    } catch (err: any) {
      return {
        success: false,
        message: err.message || "Erro ao verificar domínio.",
      };
    }
  });

export const createResendDomainInputSchema = z.object({
  domainName: z
    .string()
    .trim()
    .min(3, "Domínio inválido.")
    .regex(/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, "Formato de domínio inválido (ex: escola.ao)"),
});

export const createResendDomainFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => createResendDomainInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriter(context.supabase, context.userId, ["Administrador"]);
    const db = await loadSgaAdminClient();

    try {
      const created = await ResendDomainsClient.createDomain(data.domainName);

      // Regista o domínio na tabela tenant_domains para auditoria multi-tenant
      await db.from("tenant_domains").insert({
        tenant_id: membership.schoolId, // ou tenant_id correspondente
        hostname: data.domainName.toLowerCase(),
        type: "custom_domain",
        status: created.status === "verified" ? "active" : "pending",
      });

      return {
        success: true,
        domain: created,
        message: `Domínio ${data.domainName} registado. Configure os registos DNS DKIM e SPF no seu provedor.`,
      };
    } catch (err: any) {
      return {
        success: false,
        message: err.message || "Erro ao criar domínio no Resend.",
      };
    }
  });
