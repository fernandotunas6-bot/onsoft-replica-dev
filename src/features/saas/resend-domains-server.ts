import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ResendDomainsClient } from "@/features/integrations/resend-domains-client";
import { requirePlatformAdmin } from "./platform-guard";
import { errorMessage } from "@/lib/error-message";

/**
 * Domínios da conta Resend da PLATAFORMA (partilhada por todas as escolas).
 * Só o administrador da plataforma: com o cargo de Administrador de uma escola,
 * qualquer escola (incluindo do registo público) listava os domínios das
 * outras, pedia verificações e registava domínios na conta do SIGA.
 */
export const listResendDomainsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requirePlatformAdmin(context.userId, context.claims["aal"]);
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
    } catch (err) {
      return {
        success: false,
        error: errorMessage(err, "Erro ao consultar domínios no Resend."),
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
    await requirePlatformAdmin(context.userId, context.claims["aal"]);
    try {
      const result = await ResendDomainsClient.verifyDomain(data.domainId);
      return {
        success: result.success,
        message: result.success
          ? "Verificação solicitada com sucesso. Os registos DNS serão validados em minutos."
          : "Não foi possível validar o domínio no Resend.",
      };
    } catch (err) {
      return {
        success: false,
        message: errorMessage(err, "Erro ao verificar domínio."),
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
    await requirePlatformAdmin(context.userId, context.claims["aal"]);

    try {
      // Só cria na conta Resend. O domínio de uma escola (tenant_domains) é
      // registado pelo fluxo de domínios da escola, com o tenant certo — aqui
      // gravava-se o id da escola como tenant_id.
      const created = await ResendDomainsClient.createDomain(data.domainName);

      return {
        success: true,
        domain: created,
        message: `Domínio ${data.domainName} registado. Configure os registos DNS DKIM e SPF no seu provedor.`,
      };
    } catch (err) {
      return {
        success: false,
        message: errorMessage(err, "Erro ao criar domínio no Resend."),
      };
    }
  });
