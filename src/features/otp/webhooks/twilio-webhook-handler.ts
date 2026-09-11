import { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";

/**
 * TwilioWebhookHandler — Processa webhooks de status de SMS do Twilio.
 *
 * Endpoint: POST /api/webhooks/twilio/sms
 *
 * Twilio envia updates de status para mensagens SMS:
 * - sent: mensagem foi entregue ao SMPP gateway
 * - delivered: mensagem foi entregue ao telefone
 * - failed: mensagem falhou
 * - undelivered: falha de entrega após várias tentativas
 *
 * Documentação: https://www.twilio.com/docs/sms/tutorials/how-to-confirm-delivery-java
 */

export interface TwilioWebhookPayload {
  MessageSid: string; // ID único da mensagem no Twilio
  AccountSid: string;
  From: string;
  To: string;
  MessageStatus: "sent" | "delivered" | "failed" | "undelivered" | "queued" | "sending";
  ApiVersion?: string;
  SequenceNumber?: string;
}

/**
 * Mapeia status do Twilio para status interno do SIGA.
 */
function mapTwilioStatus(twilioStatus: string): string {
  const map: Record<string, string> = {
    sent: "sent",
    delivered: "delivered",
    failed: "failed",
    undelivered: "failed",
    queued: "pending",
    sending: "processing",
  };
  return map[twilioStatus] || "unknown";
}

/**
 * Processa webhook do Twilio e atualiza status de entrega em communication_dispatches.
 */
export async function handleTwilioSmsWebhook(payload: TwilioWebhookPayload): Promise<void> {
  const db = await loadSgaAdminClient();

  // Buscar dispatch pelo external_message_id (MessageSid do Twilio)
  const { data: dispatch, error: fetchError } = await db
    .from("communication_dispatches")
    .select("id, status")
    .eq("external_message_id", payload.MessageSid)
    .eq("provider", "twilio")
    .maybeSingle();

  if (fetchError || !dispatch) {
    console.warn(`[TwilioWebhook] Dispatch not found for MessageSid: ${payload.MessageSid}`);
    return;
  }

  // Mapear status
  const newStatus = mapTwilioStatus(payload.MessageStatus);

  // Atualizar dispatch com novo status
  const updatePayload: Record<string, unknown> = {
    status: newStatus,
    updated_at: new Date().toISOString(),
  };

  // Se foi entregue, registar timestamp
  if (newStatus === "delivered") {
    updatePayload.delivered_at = new Date().toISOString();
  }

  // Se falhou, registar erro
  if (newStatus === "failed") {
    updatePayload.error_details = `Twilio status: ${payload.MessageStatus}`;
  }

  const { error: updateError } = await db
    .from("communication_dispatches")
    .update(updatePayload)
    .eq("id", dispatch.id);

  if (updateError) {
    console.error(`[TwilioWebhook] Failed to update dispatch: ${updateError.message}`);
    return;
  }

  console.log(`[TwilioWebhook] Updated dispatch ${dispatch.id} to status: ${newStatus}`);
}

/**
 * Verifica assinatura do webhook do Twilio.
 * Twilio envia um header X-Twilio-Signature com HMAC-SHA1 da request.
 */
export function verifyTwilioWebhookSignature(
  url: string,
  body: Record<string, string>,
  signature: string,
  authToken: string,
): boolean {
  const crypto = require("crypto");

  // Reconstruir a string assinada (ordem das chaves importa)
  let data = url;
  for (const [key, value] of Object.entries(body).sort()) {
    data += key + value;
  }

  // Computar HMAC-SHA1
  const computed = crypto
    .createHmac("sha1", authToken)
    .update(data)
    .digest("base64");

  // Comparação segura (contra timing attacks)
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
}
