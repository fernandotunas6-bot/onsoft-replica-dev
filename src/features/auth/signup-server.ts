import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { getRequestIP } from "@tanstack/react-start/server";
import { getAppName, getAppUrl, getAuthMagicLinkUrl } from "@/lib/app-config";
import { renderSignupConfirmationEmail } from "./email-templates/signup-confirm.html";
import { resolveSystemSender, sendResendEmail } from "@/features/integrations/resend-client";
import { isRateLimitBypassed } from "@/lib/rate-limit";
import { consumeRateLimit } from "@/lib/shared-rate-limit";

const SIGNUP_RATE_LIMIT = { windowMs: 60 * 60 * 1000, max: 5 };

export const requestSignupInputSchema = z.object({
  fullName: z.string().trim().min(3).max(160),
  email: z.string().trim().email("Indique um endereço de e-mail válido."),
  password: z.string().min(8).max(128),
});
export type RequestSignupInput = z.infer<typeof requestSignupInputSchema>;

export type RequestSignupResponse =
  /** Pedido tratado (conta criada e e-mail enviado, ou e-mail já registado): resposta neutra. */
  | { handled: true; message: string }
  /** Sem Resend neste ambiente: nada foi criado, o cliente usa o mailer nativo do Supabase. */
  | { handled: false; reason: "resend_not_configured" };

const NEUTRAL_MESSAGE =
  "Se este e-mail ainda não tiver conta, enviámos um link de confirmação. Confirme-o e depois inicie sessão.";

/**
 * Registo de conta com o e-mail do SIGA (modelo `signup-confirm`, enviado por
 * Resend), como já acontece com a recuperação de senha, o link mágico e o
 * convite. O mailer nativo do Supabase fica só como recurso quando o Resend
 * não está configurado — tem limites de envio muito baixos sem SMTP próprio.
 *
 * `generateLink({ type: "signup" })` cria a conta **por confirmar**: sem clicar
 * no link não há login, e sem vínculo aprovado não há acesso a escola nenhuma.
 * A resposta é igual exista ou não o e-mail (anti-enumeração).
 */
export const requestSignupFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => requestSignupInputSchema.parse(input))
  .handler(async ({ data }): Promise<RequestSignupResponse> => {
    const apiKey = process.env["RESEND_API_KEY"]?.trim();
    if (!apiKey) return { handled: false, reason: "resend_not_configured" };

    const email = data.email.toLowerCase().trim();
    const ip = getRequestIP({ xForwardedFor: true }) ?? "unknown";
    const keys = [`signup:ip:${ip}`, `signup:email:${email}`];
    if (!isRateLimitBypassed(...keys) && !(await consumeRateLimit(keys, SIGNUP_RATE_LIMIT))) {
      return { handled: true, message: NEUTRAL_MESSAGE };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "signup",
      email,
      password: data.password,
      options: {
        data: { full_name: data.fullName },
        redirectTo: getAuthMagicLinkUrl(getAppUrl()),
      },
    });

    // E-mail já registado (ou política de senha): resposta neutra, sem pistas.
    if (error || !link?.properties?.action_link || !link.user?.id) {
      if (error && /password/i.test(error.message) && !/registered|exists/i.test(error.message)) {
        throw new Error("A senha não cumpre a política de segurança. Use uma senha mais forte.");
      }
      return { handled: true, message: NEUTRAL_MESSAGE };
    }

    const message = renderSignupConfirmationEmail({
      schoolName: getAppName(),
      confirmUrl: link.properties.action_link,
      platformName: getAppName(),
      platformUrl: getAppUrl(),
    });

    try {
      await sendResendEmail({
        apiKey,
        from: resolveSystemSender("auth"),
        to: [email],
        subject: message.subject,
        html: message.html,
        text: message.text,
      });
    } catch (sendError) {
      // Sem e-mail a conta ficaria presa por confirmar e o mesmo endereço já
      // não se podia registar: desfaz-se, para a pessoa poder tentar de novo.
      console.error("[Signup] Resend delivery failed:", sendError);
      await supabaseAdmin.auth.admin.deleteUser(link.user.id).catch(() => undefined);
      throw new Error("Não foi possível enviar o e-mail de confirmação. Tente novamente.");
    }

    return { handled: true, message: NEUTRAL_MESSAGE };
  });
