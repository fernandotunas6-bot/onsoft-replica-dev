import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { getAppUrl, getAppName, getAuthResetPasswordUrl } from "@/lib/app-config";
import { resolveTenantLookup } from "@/lib/saas/tenant-resolver";
import { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { renderResetPasswordEmail } from "./email-templates/reset-password.html";
import { sendResendEmail, resolveResendFromAddress } from "@/features/integrations/resend-client";

export const requestPasswordResetInputSchema = z.object({
  email: z.string().trim().email("Indique um endereço de e-mail válido."),
  hostname: z.string().trim().optional(),
});

export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetInputSchema>;

export interface PasswordResetResponse {
  success: boolean;
  message: string;
}

const NEUTRAL_SUCCESS_MESSAGE =
  "Se existir uma conta associada a este endereço, enviámos as instruções de recuperação.";

export const requestPasswordResetFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => requestPasswordResetInputSchema.parse(input))
  .handler(async ({ data }): Promise<PasswordResetResponse> => {
    const email = data.email.toLowerCase().trim();
    const hostname = data.hostname?.toLowerCase().trim() || "";

    try {
      const db = await loadSgaAdminClient();
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      // 1. Identificar Escola / Tenant a partir do contexto seguro do hostname
      let schoolName = getAppName();
      let schoolLogoUrl: string | null = null;
      let targetOrigin = getAppUrl();

      const lookup = resolveTenantLookup(hostname);

      if (lookup.mode === "slug" && lookup.slug !== "minha-escola" && lookup.slug !== "admin") {
        try {
          const { data: tenant } = await db
            .from("tenants")
            .select("id, name, slug")
            .eq("slug", lookup.slug)
            .maybeSingle();

          if (tenant?.id) {
            schoolName = tenant.name || schoolName;
            // Buscar escola correspondente
            const { data: school } = await db
              .from("schools")
              .select("id, name")
              .eq("tenant_id", tenant.id)
              .maybeSingle();

            if (school?.id) {
              schoolName = school.name || schoolName;
              // Buscar branding (logo)
              const { data: branding } = await db
                .from("school_settings")
                .select("value")
                .eq("school_id", school.id)
                .eq("domain", "branding")
                .maybeSingle();

              if (branding?.value && typeof branding.value === "object") {
                const val = branding.value as Record<string, unknown>;
                if (typeof val["logo_url"] === "string") {
                  schoolLogoUrl = val["logo_url"];
                }
              }
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
            .eq("domain", lookup.hostname)
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
                const { data: branding } = await db
                  .from("school_settings")
                  .select("value")
                  .eq("school_id", school.id)
                  .eq("domain", "branding")
                  .maybeSingle();

                if (branding?.value && typeof branding.value === "object") {
                  const val = branding.value as Record<string, unknown>;
                  if (typeof val["logo_url"] === "string") {
                    schoolLogoUrl = val["logo_url"];
                  }
                }
              }
            }
          }
        } catch {
          /* Fallback gracioso */
        }
      }

      // 2. Gerar link seguro de redefinição via Supabase Auth Admin
      const redirectTo = getAuthResetPasswordUrl(targetOrigin);

      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: "recovery",
        email,
        options: {
          redirectTo,
        },
      });

      if (linkError || !linkData?.properties?.action_link) {
        // Não revelar se o e-mail não existe na base (privacidade e proteção contra enumeração)
        console.warn("[PasswordReset] Recovery link generation skipped or failed:", linkError?.message);
        return {
          success: true,
          message: NEUTRAL_SUCCESS_MESSAGE,
        };
      }

      const resetUrl = linkData.properties.action_link;

      // 3. Renderizar e-mail com branding da escola
      const emailContent = renderResetPasswordEmail({
        schoolName,
        logoUrl: schoolLogoUrl,
        resetUrl,
        platformName: getAppName(),
        platformUrl: getAppUrl(),
        recipientEmail: email,
      });

      // 4. Enviar e-mail via Resend (se disponível) ou fallback para Supabase Auth nativo
      const resendApiKey = process.env["RESEND_API_KEY"]?.trim();
      const resendFrom =
        process.env["RESEND_FROM_EMAIL"]?.trim() ||
        process.env["E2E_ALERT_EMAIL_FROM"]?.trim() ||
        resolveResendFromAddress("seguranca@portal-siga.com");

      let sentViaResend = false;
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
          console.warn("[PasswordReset] Resend delivery failed, falling back to Supabase:", resendError);
        }
      }

      if (!sentViaResend) {
        // Fallback nativo: Supabase Auth envia o e-mail diretamente com o redirectTo correto
        try {
          await supabaseAdmin.auth.resetPasswordForEmail(email, { redirectTo });
        } catch (nativeError) {
          console.warn("[PasswordReset] Native Supabase fallback error:", nativeError);
        }
      }

      // 5. Auditoria de segurança (SEM guardar tokens, senhas ou dados sensíveis)
      try {
        await db.from("saas_audit_logs").insert({
          action: "password_reset_requested",
          entity_type: "auth",
          entity_id: linkData.user?.id || null,
          metadata: {
            school_name: schoolName,
            via_resend: sentViaResend,
            timestamp: new Date().toISOString(),
          },
        });
      } catch {
        /* Silencioso para não interromper */
      }

      return {
        success: true,
        message: NEUTRAL_SUCCESS_MESSAGE,
      };
    } catch (err) {
      console.error("[PasswordReset] Error processing request:", err);
      // Sempre responder de forma segura e neutra
      return {
        success: true,
        message: NEUTRAL_SUCCESS_MESSAGE,
      };
    }
  });
