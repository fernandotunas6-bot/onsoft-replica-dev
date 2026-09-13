import { IMessageDeliveryAdapter, OtpChannel, OtpDeliveryResult, OtpPayload } from "../contracts";

/**
 * TwilioSmsAdapter — Envia códigos OTP via SMS usando Twilio.
 *
 * Requisitos:
 * - TWILIO_ACCOUNT_SID: Account SID do Twilio
 * - TWILIO_AUTH_TOKEN: Auth token do Twilio
 * - TWILIO_FROM_NUMBER: Número de telefone remetente (ex: +244XXXXXXXXX)
 *
 * Documentação: https://www.twilio.com/docs/sms/send-messages
 */
export class TwilioSmsAdapter implements IMessageDeliveryAdapter {
  public channel: OtpChannel = "sms";
  public providerName = "twilio";

  async sendCode(payload: OtpPayload): Promise<OtpDeliveryResult> {
    // Validação básica
    if (!payload.recipient || !payload.recipient.startsWith("+")) {
      return {
        success: false,
        channel: "sms",
        provider: this.providerName,
        error: "Número de telefone inválido (deve ser E.164: +244...)",
      };
    }

    // Carregar credenciais
    const accountSid =
      (typeof process !== "undefined" && process.env?.TWILIO_ACCOUNT_SID?.trim()) || "";
    const authToken =
      (typeof process !== "undefined" && process.env?.TWILIO_AUTH_TOKEN?.trim()) || "";
    const fromNumber =
      (typeof process !== "undefined" && process.env?.TWILIO_FROM_NUMBER?.trim()) || "";

    if (!accountSid || !authToken || !fromNumber) {
      return {
        success: false,
        channel: "sms",
        provider: this.providerName,
        error: "Twilio não está configurado no servidor (faltam variáveis de ambiente).",
      };
    }

    // Compor mensagem
    const messageBody = `Seu código de verificação é ${payload.code}. Válido por ${payload.expiresInMinutes} minutos.`;

    try {
      // Chamar Twilio API via fetch (sem SDK para evitar dependency)
      const response = await fetch(
        "https://api.twilio.com/2010-04-01/Accounts/" + accountSid + "/Messages.json",
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            From: fromNumber,
            To: payload.recipient,
            Body: messageBody,
          }).toString(),
        },
      );

      interface TwilioResponse {
        sid?: string;
        error_code?: string;
        message?: string;
      }

      const data = (await response.json().catch(() => ({}))) as TwilioResponse;

      if (!response.ok || !data.sid) {
        const errorMsg = data.message || `HTTP ${response.status}`;
        return {
          success: false,
          channel: "sms",
          provider: this.providerName,
          error: `Twilio: ${errorMsg}`,
        };
      }

      return {
        success: true,
        channel: "sms",
        provider: this.providerName,
        externalMessageId: data.sid,
      };
    } catch (err: any) {
      return {
        success: false,
        channel: "sms",
        provider: this.providerName,
        error: err.message || "Falha ao enviar SMS com Twilio",
      };
    }
  }
}
