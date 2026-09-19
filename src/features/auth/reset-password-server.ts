import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { getRequestIP } from "@tanstack/react-start/server";
import { getAppUrl, getAppName, getAuthResetPasswordUrl } from "@/lib/app-config";
import { getPlatformDomain } from "@/lib/saas/platform-domain";
import { resolveTenantLookup } from "@/lib/saas/tenant-resolver";
import { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { renderResetPasswordEmail } from "./email-templates/reset-password.html";
import {
  sendResendEmail,
  resolveResendFromAddress,
  resolveSystemSender,
} from "@/features/integrations/resend-client";
import { checkRateLimit, isRateLimitBypassed, recordRateLimitAttempt } from "@/lib/rate-limit";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ContactVerificationService } from "@/features/contacts/contact-verification-service";

// Mesma razão do magic-link-server.ts: sem limite, chamadas ilimitadas ao
// Auth Admin + Resend só a variar o email (custo + assédio).
const PASSWORD_RESET_RATE_LIMIT = { windowMs: 15 * 60 * 1000, max: 5 };

export const requestPasswordResetInputSchema = z.object({
  email: z.string().trim().email("Indique um endereço de e-mail válido."),
  hostname: z.string().trim().optional(),
});

export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetInputSchema>;

export interface PasswordResetResponse {
  success: boolean;
  message: string;
}

/**
 * Branding tem duas fontes reais (ver src/features/school/server.ts, a mesma
 * lógica usada pelo painel de Definições → Escola): `school_settings` (domain
 * "branding", JSON, só logo_url) e a tabela dedicada `school_branding`
 * (logo_url + primary_color + secondary_color). `school_settings.logo_url`
 * tem prioridade sobre `school_branding.logo_url`; primary_color só existe em
 * `school_branding`.
 */
export async function fetchSchoolBranding(
  db: Awaited<ReturnType<typeof loadSgaAdminClient>>,
  schoolId: string,
): Promise<{ logoUrl: string | null; primaryColor: string | null }> {
  const [{ data: settings }, { data: brandingRow }] = await Promise.all([
    db
      .from("school_settings")
      .select("value")
      .eq("school_id", schoolId)
      .eq("domain", "branding")
      .maybeSingle(),
    db
      .from("school_branding")
      .select("logo_url, primary_color")
      .eq("school_id", schoolId)
      .maybeSingle(),
  ]);

  let logoUrlFromSettings: string | null = null;
  if (settings?.value && typeof settings.value === "object") {
    const val = settings.value as Record<string, unknown>;
    if (typeof val["logo_url"] === "string") logoUrlFromSettings = val["logo_url"];
  }

  const logoUrl =
    logoUrlFromSettings ||
    (typeof brandingRow?.logo_url === "string" ? brandingRow.logo_url : null);
  const primaryColor =
    typeof brandingRow?.primary_color === "string" ? brandingRow.primary_color : null;

  return { logoUrl, primaryColor };
}

const NEUTRAL_SUCCESS_MESSAGE =
  "Se existir uma conta associada a este endereço, enviámos as instruções de recuperação.";

export const requestPasswordResetFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => requestPasswordResetInputSchema.parse(input))
  .handler(async ({ data }): Promise<PasswordResetResponse> => {
    const email = data.email.toLowerCase().trim();
    const hostname = data.hostname?.toLowerCase().trim() || "";

    const ip = getRequestIP({ xForwardedFor: true }) ?? "unknown";
    const rateLimitKeys = [`ip:${ip}`, `email:${email}`];
    if (
      !isRateLimitBypassed(...rateLimitKeys) &&
      !checkRateLimit(rateLimitKeys, PASSWORD_RESET_RATE_LIMIT)
    ) {
      // Resposta neutra igual à de sucesso — não revelar que houve limite.
      return { success: true, message: NEUTRAL_SUCCESS_MESSAGE };
    }
    recordRateLimitAttempt(rateLimitKeys, PASSWORD_RESET_RATE_LIMIT);

    try {
      const db = await loadSgaAdminClient();
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      // 1. Identificar Escola / Tenant a partir do contexto seguro do hostname
      let schoolName = getAppName();
      let schoolLogoUrl: string | null = null;
      let schoolPrimaryColor: string | null = null;
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
        console.warn(
          "[PasswordReset] Recovery link generation skipped or failed:",
          linkError?.message,
        );
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
        primaryColor: schoolPrimaryColor,
        resetUrl,
        platformName: getAppName(),
        platformUrl: getAppUrl(),
        recipientEmail: email,
      });

      // 4. Enviar e-mail via Resend — ver nota abaixo sobre não haver fallback nativo
      const resendApiKey = process.env["RESEND_API_KEY"]?.trim();
      const resendFrom =
        process.env["E2E_ALERT_EMAIL_FROM"]?.trim() || resolveSystemSender("auth", { schoolName });

      // Envio exclusivo via Resend: o template nativo do Supabase não tem branding
      // institucional e exporia "Supabase Auth" ao utilizador, o que é proibido.
      // Se o Resend falhar ou não estiver configurado, o pedido falha de forma
      // fechada (nenhum e-mail genérico é enviado) e o incidente é auditado.
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
          console.error("[PasswordReset] Resend delivery failed:", resendError);
        }
      } else {
        deliveryError = "resend_not_configured";
        console.error(
          "[PasswordReset] RESEND_API_KEY not configured; institutional email not sent.",
        );
      }

      // 5. Auditoria de segurança (SEM guardar tokens, senhas ou dados sensíveis)
      try {
        await db.from("saas_audit_logs").insert({
          action: sentViaResend ? "password_reset_requested" : "password_reset_failed",
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

/**
 * Marca o e-mail como verificado após reset de password bem-sucedido.
 * Chamado pelo frontend após a sessão ser estabelecida.
 */
export const syncPasswordResetVerificationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!context) throw new Error("Unauthorized");

    try {
      await ContactVerificationService.markEmailAsVerified(context.userId);
      return { success: true };
    } catch (err) {
      console.error("[PasswordReset] Failed to sync verification:", err);
      return { success: false };
    }
  });
