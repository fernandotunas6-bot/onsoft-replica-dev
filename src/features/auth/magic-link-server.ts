import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { getRequestIP } from "@tanstack/react-start/server";
import { getAppUrl, getAppName, getAuthMagicLinkUrl } from "@/lib/app-config";
import { resolveTenantLookup } from "@/lib/saas/tenant-resolver";
import { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { fetchSchoolBranding } from "./reset-password-server";
import { renderMagicLinkEmail } from "./email-templates/magic-link.html";
import {
  sendResendEmail,
  resolveResendFromAddress,
  resolveSystemSender,
} from "@/features/integrations/resend-client";
import { isRateLimitBypassed } from "@/lib/rate-limit";
import { consumeRateLimit } from "@/lib/shared-rate-limit";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ContactVerificationService } from "@/features/contacts/contact-verification-service";

// Sem limite aqui, um único cliente conseguia disparar chamadas ilimitadas ao
// Auth Admin da Supabase e ao Resend só a variar o email — custo directo e
// vector de assédio (inundar a caixa de outra pessoa). 5 por 15 min por
// IP/email é generoso para um utilizador legítimo e barra automação.
const MAGIC_LINK_RATE_LIMIT = { windowMs: 15 * 60 * 1000, max: 5 };

export const requestMagicLinkInputSchema = z.object({
  email: z.string().trim().email("Indique um endereço de e-mail válido."),
  hostname: z.string().trim().optional(),
});

export type RequestMagicLinkInput = z.infer<typeof requestMagicLinkInputSchema>;

export interface MagicLinkResponse {
  success: boolean;
  message: string;
}

const NEUTRAL_SUCCESS_MESSAGE =
  "Se existir uma conta associada a este endereço, enviámos um link de acesso.";

/**
 * Mesma arquitectura de src/features/auth/reset-password-server.ts: resolve a
 * escola/tenant pelo hostname, gera o link via Supabase Auth Admin, renderiza
 * o e-mail com o branding da escola e envia por Resend. Nunca cai para o
 * mailer nativo do Supabase — falha fechada e neutra (anti-enumeração).
 */
export const requestMagicLinkFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => requestMagicLinkInputSchema.parse(input))
  .handler(async ({ data }): Promise<MagicLinkResponse> => {
    const email = data.email.toLowerCase().trim();
    const hostname = data.hostname?.toLowerCase().trim() || "";

    const ip = getRequestIP({ xForwardedFor: true }) ?? "unknown";
    const rateLimitKeys = [`ip:${ip}`, `email:${email}`];
    if (
      !isRateLimitBypassed(...rateLimitKeys) &&
      !(await consumeRateLimit(rateLimitKeys, MAGIC_LINK_RATE_LIMIT))
    ) {
      // Resposta neutra igual à de sucesso — não revelar que houve limite.
      return { success: true, message: NEUTRAL_SUCCESS_MESSAGE };
    }

    try {
      const db = await loadSgaAdminClient();
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      let schoolName = getAppName();
      let schoolLogoUrl: string | null = null;
      let schoolPrimaryColor: string | null = null;
      let targetOrigin = getAppUrl();

      const lookup = resolveTenantLookup(hostname);

      if (lookup.mode === "slug" && lookup.slug !== "minha-escola" && lookup.slug !== "admin") {
        try {
          const { data: tenant } = await db
            .from("tenants")
            .select("id, name")
            .eq("slug", lookup.slug)
            .maybeSingle();
          if (tenant?.id) {
            schoolName = tenant.name || schoolName;
            const { data: school } = await db
              .from("schools")
              .select("id, name")
              .eq("tenant_id", tenant.id)
              .maybeSingle();
            if (school?.id) {
              schoolName = school.name || schoolName;
              const branding = await fetchSchoolBranding(db, school.id);
              schoolLogoUrl = branding.logoUrl;
              schoolPrimaryColor = branding.primaryColor;
            }
          }
        } catch {
          /* Fallback gracioso para neutral */
        }
      } else if (lookup.mode === "hostname") {
        try {
          const { data: domainRow } = await db
            .from("tenant_domains")
            .select("tenant_id")
            .eq("hostname", lookup.hostname)
            .eq("status", "verified")
            .maybeSingle();
          if (domainRow?.tenant_id) {
            const { data: tenant } = await db
              .from("tenants")
              .select("id, name")
              .eq("id", domainRow.tenant_id)
              .maybeSingle();
            if (tenant?.id) {
              schoolName = tenant.name || schoolName;
              targetOrigin = `https://${lookup.hostname}`;
              const { data: school } = await db
                .from("schools")
                .select("id, name")
                .eq("tenant_id", tenant.id)
                .maybeSingle();
              if (school?.id) {
                schoolName = school.name || schoolName;
                const branding = await fetchSchoolBranding(db, school.id);
                schoolLogoUrl = branding.logoUrl;
                schoolPrimaryColor = branding.primaryColor;
              }
            }
          }
        } catch {
          /* Fallback gracioso */
        }
      }

      const redirectTo = getAuthMagicLinkUrl(targetOrigin);

      // IMPORTANTE: usar type "recovery", não "magiclink". A documentação do
      // Supabase é explícita — generateLink() cria automaticamente a conta
      // para os tipos "signup", "invite" e "magiclink" se o e-mail não existir.
      // Isso permitiria criar contas arbitrárias só por digitar um e-mail no
      // formulário de login, quebrando o isolamento multi-tenant. "recovery"
      // não cria conta e produz um link com o mesmo mecanismo de sessão — o
      // conteúdo do e-mail (assunto, texto, CTA) continua a ser o nosso, não
      // o template nativo do Supabase.
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo },
      });

      if (linkError || !linkData?.properties?.action_link) {
        console.warn("[MagicLink] Link generation skipped or failed:", linkError?.message);
        return { success: true, message: NEUTRAL_SUCCESS_MESSAGE };
      }

      const magicLinkUrl = linkData.properties.action_link;

      const emailContent = renderMagicLinkEmail({
        schoolName,
        logoUrl: schoolLogoUrl,
        primaryColor: schoolPrimaryColor,
        magicLinkUrl,
        platformName: getAppName(),
        platformUrl: getAppUrl(),
      });

      const resendApiKey = process.env["RESEND_API_KEY"]?.trim();
      const resendFrom = resolveSystemSender("auth", { schoolName });

      let sentViaResend = false;
      let deliveryError: string | null = null;
      if (resendApiKey) {
        try {
          await sendResendEmail({
            apiKey: resendApiKey,
            from: resendFrom,
            to: [email],
            subject: emailContent.subject,
            html: emailContent.html,
            text: emailContent.text,
          });
          sentViaResend = true;
        } catch (resendError) {
          deliveryError = resendError instanceof Error ? resendError.message : "unknown_error";
          console.error("[MagicLink] Resend delivery failed:", resendError);
        }
      } else {
        deliveryError = "resend_not_configured";
        console.error("[MagicLink] RESEND_API_KEY not configured; magic link email not sent.");
      }

      try {
        await db.from("saas_audit_logs").insert({
          action: sentViaResend ? "magic_link_requested" : "magic_link_failed",
          entity: "auth",
          entity_id: linkData.user?.id || null,
          metadata: {
            school_name: schoolName,
            via_resend: sentViaResend,
            delivery_error: deliveryError,
            timestamp: new Date().toISOString(),
          },
        });
      } catch {
        /* Silencioso para não interromper */
      }

      return { success: true, message: NEUTRAL_SUCCESS_MESSAGE };
    } catch (err) {
      console.error("[MagicLink] Error processing request:", err);
      return { success: true, message: NEUTRAL_SUCCESS_MESSAGE };
    }
  });

/**
 * Marca o e-mail como verificado após login bem-sucedido via magic link.
 * Chamado pelo frontend após a sessão ser estabelecida.
 */
export const syncMagicLinkVerificationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!context) throw new Error("Unauthorized");

    try {
      await ContactVerificationService.markEmailAsVerified(context.userId);
      return { success: true };
    } catch (err) {
      console.error("[MagicLink] Failed to sync verification:", err);
      return { success: false };
    }
  });
