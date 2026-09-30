import { IMessageDeliveryAdapter, OtpChannel, OtpDeliveryResult, OtpPayload } from "../contracts";
import { errorMessage } from "@/lib/error-message";

/**
 * WhatsAppOtpAdapter — Envia códigos OTP via WhatsApp usando Meta Cloud API.
 *
 * Requisitos:
 * - WHATSAPP_PHONE_NUMBER_ID: ID do número de telefone WhatsApp Business
 * - WHATSAPP_ACCESS_TOKEN: Access token da API do WhatsApp
 * - WHATSAPP_OTP_TEMPLATE_NAME: Nome do template pré-aprovado (ex: "siga_auth_code")
 *
 * Template esperado:
 * Nome: siga_auth_code
 * Corpo: "Seu código de verificação {{1}} é válido por {{2}} minutos."
 *
 * Documentação: https://developers.facebook.com/docs/whatsapp/cloud-api/
 */
export class WhatsAppOtpAdapter implements IMessageDeliveryAdapter {
  public channel: OtpChannel = "whatsapp";
  public providerName = "meta";

  async sendCode(payload: OtpPayload): Promise<OtpDeliveryResult> {
    // Validação básica
    if (!payload.recipient || !payload.recipient.startsWith("+")) {
      return {
        success: false,
        channel: "whatsapp",
        provider: this.providerName,
        error: "Número de WhatsApp inválido (deve ser E.164: +244...)",
      };
    }

    // Carregar credenciais
    const phoneNumberId =
      (typeof process !== "undefined" && process.env?.WHATSAPP_PHONE_NUMBER_ID?.trim()) || "";
    const accessToken =
      (typeof process !== "undefined" && process.env?.WHATSAPP_ACCESS_TOKEN?.trim()) || "";
    const templateName =
      (typeof process !== "undefined" && process.env?.WHATSAPP_OTP_TEMPLATE_NAME?.trim()) ||
      "siga_auth_code";

    if (!phoneNumberId || !accessToken) {
      return {
        success: false,
        channel: "whatsapp",
        provider: this.providerName,
        error: "WhatsApp não está configurado (faltam WHATSAPP_PHONE_NUMBER_ID ou ACCESS_TOKEN).",
      };
    }

    // Normaliza número: remove '+' para API Meta (E.164 sem o '+')
    const cleanNumber = payload.recipient.replace(/\D/g, "");

    try {
      const response = await fetch(
        // API do WhatsApp Cloud (Meta). O endereço antigo era o do Instagram,
        // e os códigos por WhatsApp nunca chegavam.
        `https://graph.facebook.com/v21.0/${encodeURIComponent(phoneNumberId)}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: cleanNumber,
            type: "template",
            template: {
              name: templateName,
              language: {
                code: "pt_PT",
              },
              components: [
                {
                  type: "body",
                  parameters: [
                    {
                      type: "text",
                      text: payload.code,
                    },
                    {
                      type: "text",
                      text: payload.expiresInMinutes.toString(),
                    },
                  ],
                },
              ],
            },
          }),
        },
      );

      interface MetaResponse {
        messages?: Array<{ id: string }>;
        error?: { message: string; code: number };
      }

      const data = (await response.json().catch(() => ({}))) as MetaResponse;

      if (!response.ok || !data.messages?.[0]) {
        const errorMsg = data.error?.message || `HTTP ${response.status}`;
        return {
          success: false,
          channel: "whatsapp",
          provider: this.providerName,
          error: `Meta: ${errorMsg}`,
        };
      }

      return {
        success: true,
        channel: "whatsapp",
        provider: this.providerName,
        externalMessageId: data.messages[0].id,
      };
    } catch (err) {
      return {
        success: false,
        channel: "whatsapp",
        provider: this.providerName,
        error: errorMessage(err, "Falha ao enviar mensagem WhatsApp"),
      };
    }
  }
}
