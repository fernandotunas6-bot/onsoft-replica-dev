import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadSgaAdminClient, resolveSgaMembershipAdmin } from "@/integrations/supabase/sga-admin";
import { OtpDispatcher } from "@/features/otp/otp-dispatcher";
import { OtpService } from "@/features/otp/otp-service";
import { getAppName } from "@/lib/app-config";
import { passwordGrant } from "@/features/access/bi-login";

export const requestPhoneChangeInputSchema = z.object({
  newPhone: z.string().trim().min(9, "Indique um número de telemóvel válido."),
  preferredChannel: z.enum(["whatsapp", "sms"]).default("whatsapp"),
  currentPassword: z.string().min(1, "Indique a senha actual.").max(200),
});

export type RequestPhoneChangeInput = z.infer<typeof requestPhoneChangeInputSchema>;

export const confirmPhoneChangeInputSchema = z.object({
  newPhone: z.string().trim().min(9, "Indique o número de telemóvel a confirmar."),
  code: z.string().trim().length(6, "O código de verificação deve ter 6 dígitos."),
});

export type ConfirmPhoneChangeInput = z.infer<typeof confirmPhoneChangeInputSchema>;

export const requestPhoneChangeOtpFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => requestPhoneChangeInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const normalizedPhone = OtpService.normalizeIdentifier(data.newPhone);

    // O telefone também recupera a senha por código: mudá-lo exige a senha
    // actual, como o e-mail. Uma sessão deixada aberta não chega.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: authData } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const currentEmail = authData.user?.email;
    if (!currentEmail) {
      return { success: false, message: "Esta conta não tem e-mail para confirmar a senha." };
    }
    const check = await passwordGrant(currentEmail, data.currentPassword);
    if (!check.ok) {
      return {
        success: false,
        message:
          check.error === "invalid_credentials"
            ? "A senha actual não está correcta."
            : "Não foi possível confirmar a senha actual. Tente mais tarde.",
      };
    }

    const db = await loadSgaAdminClient();
    const membership = await resolveSgaMembershipAdmin(context.userId);

    let schoolName = getAppName();
    if (membership?.schoolId) {
      const { data: school } = await db
        .from("schools")
        .select("name")
        .eq("id", membership.schoolId)
        .maybeSingle();
      if (school?.name) schoolName = school.name;
    }

    const dispatcher = new OtpDispatcher();
    const result = await dispatcher.requestOtp({
      targetIdentifier: normalizedPhone,
      purpose: "phone_change",
      preferredChannel: data.preferredChannel,
      schoolId: membership?.schoolId,
      schoolName,
      userId: context.userId,
    });

    if (!result.success) {
      return {
        success: false,
        message: result.error || "Não foi possível enviar o código para o novo número.",
        cooldownSeconds: result.cooldownSeconds,
      };
    }

    return {
      success: true,
      message:
        `Código de verificação enviado via ${result.channelUsed?.toUpperCase() || "mensagem"}.` as string,
      channelUsed: result.channelUsed,
      cooldownSeconds: result.cooldownSeconds,
    };
  });

export const confirmPhoneChangeWithOtpFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => confirmPhoneChangeInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Não autenticado.");
    const normalizedPhone = OtpService.normalizeIdentifier(data.newPhone);

    // 1. Valida o código OTP
    const verification = await OtpService.verifyCode({
      targetIdentifier: normalizedPhone,
      purpose: "phone_change",
      code: data.code,
      // Só vale o código que esta conta pediu.
      userId: context.userId,
    });

    if (!verification.valid) {
      if (verification.reason === "expired") {
        return {
          success: false,
          message: "O código de verificação expirou. Solicite um novo código.",
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
        message: `Código incorreto. Tentativas restantes: ${verification.attemptsLeft ?? 0}.`,
        attemptsLeft: verification.attemptsLeft,
      };
    }

    // 2. Atualiza o número de telefone no perfil do utilizador
    const db = await loadSgaAdminClient();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await db
      .from("profiles")
      .update({
        phone: normalizedPhone,
        updated_at: new Date().toISOString(),
      })
      .eq("id", context.userId);

    // Atualiza também na base de auth do Supabase
    try {
      await supabaseAdmin.auth.admin.updateUserById(context.userId, {
        phone: normalizedPhone,
      });
    } catch {
      // Best-effort se phone auth não estiver ativado no projeto
    }

    // 3. Registo na auditoria de segurança
    try {
      await db.from("saas_audit_logs").insert({
        action: "profile_phone_changed_otp",
        user_id: context.userId,
        metadata: {
          new_phone: normalizedPhone,
        },
      });
    } catch {
      // Best-effort
    }

    return {
      success: true,
      message: "Número de telemóvel atualizado e confirmado com sucesso!",
    };
  });
