import { json } from "@tanstack/react-start";
import {
  handleWhatsAppWebhook,
  verifyMetaWebhookSignature,
  type MetaWebhookEvent,
} from "@/features/otp/webhooks";

/**
 * POST /api/webhooks/whatsapp-status
 * GET /api/webhooks/whatsapp-status (para verificação da Meta)
 *
 * Recebe webhooks de status de WhatsApp da Meta Cloud API.
 * Processa atualizações de entrega, leitura, falhas, etc.
 *
 * Headers esperados:
 * - X-Hub-Signature-256: sha256=<HMAC-SHA256>
 *
 * Body esperado (POST):
 * - object: "whatsapp_business_account"
 * - entry: Array de eventos com status updates
 *
 * Query params (GET - para verificação):
 * - hub.mode: "subscribe"
 * - hub.challenge: Token de verificação
 * - hub.verify_token: Token configurado no Webhook
 */

export async function GET(request: Request) {
  try {
    // Verificação inicial da Meta (webhook setup)
    const url = new URL(request.url);
    const mode = url.searchParams.get("hub.mode");
    const challenge = url.searchParams.get("hub.challenge");
    const verifyToken = url.searchParams.get("hub.verify_token");

    const configuredToken = (typeof process !== "undefined" && process.env?.WHATSAPP_WEBHOOK_VERIFY_TOKEN) || "";

    if (mode === "subscribe" && verifyToken === configuredToken) {
      return new Response(challenge, { status: 200 });
    }

    return json({ error: "Invalid verification" }, { status: 403 });
  } catch (err) {
    console.error("[WhatsApp Webhook GET] Error:", err);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    // 1. Ler body como texto (para verificação de assinatura)
    const body = await request.text();

    // 2. Verificar assinatura
    const signature = request.headers.get("x-hub-signature-256") || "";
    const appSecret = (typeof process !== "undefined" && process.env?.META_APP_SECRET) || "";

    if (!appSecret) {
      console.error("[WhatsApp Webhook] META_APP_SECRET not configured");
      return json({ error: "Not configured" }, { status: 500 });
    }

    const isValid = verifyMetaWebhookSignature(body, signature, appSecret);

    if (!isValid) {
      console.warn("[WhatsApp Webhook] Invalid signature");
      return json({ error: "Invalid signature" }, { status: 401 });
    }

    // 3. Parse JSON
    let payload: MetaWebhookEvent;
    try {
      payload = JSON.parse(body);
    } catch {
      console.error("[WhatsApp Webhook] Invalid JSON");
      return json({ error: "Invalid JSON" }, { status: 400 });
    }

    // 4. Validar estrutura básica
    if (payload.object !== "whatsapp_business_account" || !Array.isArray(payload.entry)) {
      console.warn("[WhatsApp Webhook] Invalid payload structure");
      return json({ error: "Invalid structure" }, { status: 400 });
    }

    // 5. Processar webhook (fire-and-forget)
    handleWhatsAppWebhook(payload).catch((err) => {
      console.error("[WhatsApp Webhook] Processing error:", err);
    });

    // 6. Responder imediatamente (Meta espera resposta rápida)
    return json({ success: true }, { status: 200 });
  } catch (err) {
    console.error("[WhatsApp Webhook POST] Error:", err);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}
