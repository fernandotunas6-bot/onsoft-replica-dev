import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { getRequestIP } from "@tanstack/react-start/server";
import { OtpDispatcher } from "./otp-dispatcher";
import { OtpService } from "./otp-service";
import { resolveTenantLookup } from "@/lib/saas/tenant-resolver";
import { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { getAppName } from "@/lib/app-config";

export const requestOtpInputSchema = z.object({
  targetIdentifier: z.string().trim().min(3, "Indique um e-mail ou número de telefone válido."),
  purpose: z.enum([
    "signup_verification",
    "login_2fa",
    "password_reset",
    "phone_change",
    "email_change",
    "payflow_sensitive_op",
    "grade_approval",
    "admin_step_up",
  ]),
  preferredChannel: z.enum(["email", "sms", "whatsapp"]).optional(),
  hostname: z.string().trim().optional(),
});

export type RequestOtpInput = z.infer<typeof requestOtpInputSchema>;

export const verifyOtpInputSchema = z.object({
  targetIdentifier: z.string().trim().min(3, "Indique um e-mail ou número de telefone válido."),
  purpose: z.enum([
    "signup_verification",
    "login_2fa",
    "password_reset",
    "phone_change",
    "email_change",
    "payflow_sensitive_op",
    "grade_approval",
    "admin_step_up",
  ]),
  code: z.string().trim().length(6, "O código de verificação deve ter 6 dígitos."),
});

export type VerifyOtpInput = z.infer<typeof verifyOtpInputSchema>;

export const requestOtpVerificationFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => requestOtpInputSchema.parse(input))
  .handler(async ({ data }) => {
    const ip = getRequestIP({ xForwardedFor: true }) ?? "unknown";
    const dispatcher = new OtpDispatcher();

    // 1. Resolução do Tenant / Escola caso haja hostname
    let schoolId: string | null = null;
    let schoolName: string = getAppName();

    if (data.hostname) {
      try {
        const db = await loadSgaAdminClient();
        const tenantInfo = resolveTenantLookup(data.hostname);
        if (
          tenantInfo.mode === "slug" &&
          tenantInfo.slug !== "admin" &&
          tenantInfo.slug !== "minha-escola"
        ) {
          const { data: tenant } = await db
            .from("tenants")
            .select("id, name")
            .eq("slug", tenantInfo.slug)
            .maybeSingle();
          if (tenant?.id) {
            const { data: schoolRow } = await db
              .from("schools")
              .select("id, name")
              .eq("tenant_id", tenant.id)
              .maybeSingle();
            if (schoolRow?.id) {
              schoolId = schoolRow.id;
              schoolName = schoolRow.name || tenant.name || schoolName;
            }
          }
        }
      } catch {
        // Fallback gracioso para nome da plataforma
      }
    }

    const result = await dispatcher.requestOtp({
      targetIdentifier: data.targetIdentifier,
      purpose: data.purpose,
      preferredChannel: data.preferredChannel,
      schoolId,
      schoolName,
      requestedIp: ip,
    });

    if (!result.success) {
      return {
        success: false,
        message: result.error || "Não foi possível enviar o código de verificação.",
        cooldownSeconds: result.cooldownSeconds,
      };
    }

    return {
      success: true,
      message: `Código enviado com sucesso via ${result.channelUsed?.toUpperCase() || "mensagem"}.`,
      channelUsed: result.channelUsed,
      cooldownSeconds: result.cooldownSeconds,
    };
  });

export const verifyOtpCodeFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => verifyOtpInputSchema.parse(input))
  .handler(async ({ data }) => {
    const verification = await OtpService.verifyCode({
      targetIdentifier: data.targetIdentifier,
      purpose: data.purpose,
      code: data.code,
    });

    if (!verification.valid) {
      switch (verification.reason) {
        case "expired":
          return {
            success: false,
            message: "O código de verificação expirou. Por favor, solicite um novo.",
          };
        case "too_many_attempts":
          return {
            success: false,
            message: "Limite de tentativas excedido. O código foi invalidado por segurança.",
          };
        case "not_found":
          return {
            success: false,
            message: "Nenhuma solicitação de verificação ativa encontrada para este destino.",
          };
        case "invalid_code":
        default:
          return {
            success: false,
            message: `Código incorreto. Tentativas restantes: ${verification.attemptsLeft ?? 0}.`,
            attemptsLeft: verification.attemptsLeft,
          };
      }
    }

    return {
      success: true,
      message: "Código de verificação validado com sucesso.",
    };
  });
