import { json } from "@tanstack/react-start";
import {
  handleTwilioSmsWebhook,
  verifyTwilioWebhookSignature,
  type TwilioWebhookPayload,
} from "@/features/otp/webhooks";

/**
 * POST /api/webhooks/twilio-sms
 *
 * Recebe webhooks de status de SMS do Twilio.
 * Twilio envia atualizações quando uma mensagem é entregue, falha, etc.
 *
 * Headers esperados:
 * - X-Twilio-Signature: HMAC-SHA1 da request
 *
 * Body esperado:
 * - MessageSid: ID único da mensagem
 * - MessageStatus: sent|delivered|failed|undelivered
 * - From: Número remetente
 * - To: Número destinatário
 */

export async function POST(request: Request) {
  try {
    // 1. Verificar método
    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, { status: 405 });
    }

    // 2. Ler body
    const body = await request.text();
    const params = new URLSearchParams(body);
    const payload = Object.fromEntries(params) as unknown as TwilioWebhookPayload;

    // 3. Verificar assinatura
    const signature = request.headers.get("x-twilio-signature") || "";
    const authToken = (typeof process !== "undefined" && process.env?.TWILIO_WEBHOOK_AUTH_TOKEN) || "";

    if (!authToken) {
      console.error("[Twilio Webhook] TWILIO_WEBHOOK_AUTH_TOKEN not configured");
      return json({ error: "Not configured" }, { status: 500 });
    }

    const url = new URL(request.url).href.split("?")[0]; // Remove query params
    const isValid = verifyTwilioWebhookSignature(url, payload, signature, authToken);

    if (!isValid) {
      console.warn("[Twilio Webhook] Invalid signature");
      return json({ error: "Invalid signature" }, { status: 401 });
    }

    // 4. Processar webhook
    await handleTwilioSmsWebhook(payload);

    // 5. Responder com sucesso
    return json({ success: true });
  } catch (err) {
    console.error("[Twilio Webhook] Error:", err);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}
