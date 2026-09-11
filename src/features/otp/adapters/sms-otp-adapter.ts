import { IMessageDeliveryAdapter, OtpChannel, OtpDeliveryResult, OtpPayload } from "../contracts";

export class SmsOtpAdapter implements IMessageDeliveryAdapter {
  public channel: OtpChannel = "sms";
  public providerName = "sms_gateway";

  async sendCode(payload: OtpPayload): Promise<OtpDeliveryResult> {
    const apiKey = (typeof process !== "undefined" && process.env?.SMS_API_KEY?.trim()) || "";
    const apiUrl =
      (typeof process !== "undefined" && process.env?.SMS_API_URL?.trim()) ||
      "https://api.infobip.com/sms/2/text/advanced";

    const schoolDisplay = payload.schoolName || "SIGA Plus";
    const cleanPhone = payload.recipient.replace(/\D/g, "");
    const formattedRecipient = cleanPhone.startsWith("+") ? cleanPhone : `+${cleanPhone}`;

    // Mensagem concisa respeitando o limite de 160 caracteres GSM-7
    const messageText = `${schoolDisplay}: O seu código é ${payload.code}. Válido por ${payload.expiresInMinutes} minutos.`;

    if (!apiKey) {
      return {
        success: false,
        channel: "sms",
        provider: this.providerName,
        error: "SMS_API_KEY não configurada no servidor.",
      };
    }

    try {
      // Formato padrão compatível com agregadores (ex: Infobip / Twilio / Gateway local)
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: {
          Authorization: `App ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          messages: [
            {
              destinations: [{ to: formattedRecipient }],
              from: "SIGA Plus",
              text: messageText,
            },
          ],
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        messages?: Array<{ messageId?: string; status?: { groupName?: string; description?: string } }>;
        error?: string;
      };

      if (!res.ok) {
        return {
          success: false,
          channel: "sms",
          provider: this.providerName,
          error: data.error || `Erro HTTP ${res.status} no Gateway SMS`,
        };
      }

      const externalMessageId = data.messages?.[0]?.messageId;
      return {
        success: true,
        channel: "sms",
        provider: this.providerName,
        externalMessageId,
      };
    } catch (err: any) {
      return {
        success: false,
        channel: "sms",
        provider: this.providerName,
        error: err.message || "Falha na chamada ao Gateway SMS",
      };
    }
  }
}
