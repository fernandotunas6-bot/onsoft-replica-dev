import { IMessageDeliveryAdapter, OtpChannel, OtpDeliveryResult, OtpPayload } from "../contracts";
import { escapeHtml } from "@/features/auth/email-templates/reset-password.html";
import { sendResendEmail, resolveSystemSender } from "@/features/integrations/resend-client";
import { errorMessage } from "@/lib/error-message";

export class ResendOtpAdapter implements IMessageDeliveryAdapter {
  public channel: OtpChannel = "email";
  public providerName = "resend";

  async sendCode(payload: OtpPayload): Promise<OtpDeliveryResult> {
    const apiKey = (typeof process !== "undefined" && process.env?.RESEND_API_KEY?.trim()) || "";

    if (!apiKey) {
      return {
        success: false,
        channel: "email",
        provider: this.providerName,
        error: "RESEND_API_KEY não configurada no servidor.",
      };
    }

    const schoolDisplay = payload.schoolName || "SIGA Plus";
    const schoolDisplayHtml = escapeHtml(schoolDisplay);
    const from = resolveSystemSender("auth", { schoolName: payload.schoolName });

    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 460px; margin: 0 auto; padding: 28px 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h2 style="color: #0f172a; font-size: 20px; font-weight: 700; margin: 0 0 8px;">Código de Verificação</h2>
          <p style="color: #64748b; font-size: 14px; margin: 0;">${schoolDisplayHtml}</p>
        </div>
        <p style="color: #334155; font-size: 14px; line-height: 1.5; margin: 0 0 20px;">
          Utilize o código numérico abaixo para autenticar a sua operação no SIGA Plus.
        </p>
        <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 16px; text-align: center; margin-bottom: 24px;">
          <span style="font-family: monospace; font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #0f172a;">
            ${payload.code}
          </span>
        </div>
        <p style="color: #64748b; font-size: 12px; line-height: 1.4; margin: 0 0 16px;">
          Este código expira em <strong>${payload.expiresInMinutes} minutos</strong>. Se não solicitou esta verificação, ignore esta mensagem com segurança.
        </p>
        <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 20px 0;" />
        <p style="color: #94a3b8; font-size: 11px; text-align: center; margin: 0;">
          Enviado com segurança pelo SIGA Plus &bull; portal-siga.com
        </p>
      </div>
    `;

    const textContent = `${schoolDisplay}: O seu código de verificação é ${payload.code}. Válido por ${payload.expiresInMinutes} minutos.`;

    try {
      const res = await sendResendEmail({
        apiKey,
        from,
        to: [payload.recipient],
        subject: `${payload.code} é o seu código de verificação — ${schoolDisplay}`,
        html: htmlContent,
        text: textContent,
      });

      return {
        success: true,
        channel: "email",
        provider: this.providerName,
        externalMessageId: res.id || undefined,
      };
    } catch (err) {
      return {
        success: false,
        channel: "email",
        provider: this.providerName,
        error: errorMessage(err, "Falha no envio de e-mail com Resend"),
      };
    }
  }
}
