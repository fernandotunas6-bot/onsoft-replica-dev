import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { serverFnClientIp } from "@/lib/server-fn-ip";
import { OtpService } from "@/features/otp/otp-service";
import { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { resolveResetAccount } from "./reset-account-resolver";
import { consumeRateLimit } from "@/lib/shared-rate-limit";
import { isRateLimitBypassed } from "@/lib/rate-limit";

/**
 * Tecto de tentativas por conta e por IP. Cada código novo invalida o anterior e dá
 * outras 5 tentativas, e pedir um código é público (1 por minuto): eram ~300
 * tentativas por hora por conta, sem fim — ~20 % de acertar num código de 6 dígitos
 * num mês. Com 20 por dia, a hipótese fica desprezável.
 */
export const RESET_OTP_TRIES_PER_ACCOUNT = { windowMs: 24 * 60 * 60 * 1000, max: 20 };
export const RESET_OTP_TRIES_PER_IP = { windowMs: 60 * 60 * 1000, max: 30 };

export const resetPasswordWithOtpInputSchema = z.object({
  targetIdentifier: z.string().trim().min(3, "Indique o e-mail ou telefone da conta."),
  code: z.string().trim().length(6, "O código de verificação deve ter 6 dígitos."),
  newPassword: z.string().min(8, "A nova senha deve ter pelo menos 8 caracteres."),
});

export type ResetPasswordWithOtpInput = z.infer<typeof resetPasswordWithOtpInputSchema>;

export const resetPasswordWithOtpFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => resetPasswordWithOtpInputSchema.parse(input))
  .handler(async ({ data }) => {
    const ip = serverFnClientIp();
    const normalized = OtpService.normalizeIdentifier(data.targetIdentifier);
    const accountKey = `reset_otp_try:${normalized}`;
    const ipKey = `reset_otp_ip:${ip}`;
    if (
      (!isRateLimitBypassed(accountKey) &&
        !(await consumeRateLimit([accountKey], RESET_OTP_TRIES_PER_ACCOUNT))) ||
      (!isRateLimitBypassed(ipKey) && !(await consumeRateLimit([ipKey], RESET_OTP_TRIES_PER_IP)))
    ) {
      return {
        success: false,
        message: "Demasiadas tentativas. Tente de novo mais tarde ou peça ajuda à escola.",
      };
    }

    // 1. Validação estrita do código OTP via OtpService
    const verification = await OtpService.verifyCode({
      targetIdentifier: normalized,
      purpose: "password_reset",
      code: data.code,
    });

    if (!verification.valid) {
      if (verification.reason === "expired") {
        return {
          success: false,
          message: "O código de verificação expirou. Por favor, solicite um novo.",
        };
      }
      if (verification.reason === "too_many_attempts") {
        return {
          success: false,
          message: "Limite de tentativas excedido. O código foi cancelado por segurança.",
        };
      }
      return {
        success: false,
        message: `Código de verificação incorreto. Tentativas restantes: ${verification.attemptsLeft ?? 0}.`,
        attemptsLeft: verification.attemptsLeft,
      };
    }

    // 2. Localização da conta do utilizador por email ou telefone
    const db = await loadSgaAdminClient();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const isEmail = normalized.includes("@");
    const userId = await resolveResetAccount(db, supabaseAdmin, normalized);

    if (!userId) {
      return {
        success: false,
        message: "Não foi possível localizar o perfil associado a este contacto.",
      };
    }

    // 3. Atualiza a senha no Auth Admin
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: data.newPassword,
    });

    if (updateError) {
      return {
        success: false,
        message: "Não foi possível actualizar a senha. Tente novamente.",
      };
    }

    // 4. Regista na auditoria de segurança
    try {
      await db.from("saas_audit_logs").insert({
        action: "password_reset_otp_completed",
        entity: "auth",
        user_id: userId,
        ip_address: ip,
        metadata: {
          channel_verified: isEmail ? "email" : "phone",
          identifier: normalized,
          // `saas_audit_logs` não tem coluna de e-mail do actor: vive no metadata.
          actor_email: isEmail ? normalized : null,
        },
      });
    } catch {
      // Best-effort
    }

    return {
      success: true,
      message:
        "Palavra-passe redefinida com sucesso! Pode agora iniciar sessão com a nova credencial.",
    };
  });
