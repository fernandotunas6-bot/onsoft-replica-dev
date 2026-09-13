import { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { hmacHex, signaturesMatch } from "./hmac";

/**
 * WhatsAppWebhookHandler — Processa webhooks de status de WhatsApp da Meta.
 *
 * Endpoint: POST /api/webhooks/whatsapp/status
 *
 * Meta envia updates de status para mensagens:
 * - sent: mensagem foi aceita pelo WhatsApp
 * - delivered: mensagem foi entregue ao telefone
 * - read: utilizador leu a mensagem
 * - failed: erro ao enviar
 *
 * Documentação: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-example
 */

export interface MetaWebhookEvent {
  object: "whatsapp_business_account";
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: "whatsapp";
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
        statuses?: Array<{
          id: string;
          status: "sent" | "delivered" | "read" | "failed";
          timestamp: string;
          recipient_id?: string;
          errors?: Array<{
            code: number;
            title: string;
          }>;
        }>;
        messages?: Array<{
          from: string;
          id: string;
          timestamp: string;
          text: { body: string };
          type: "text";
        }>;
      };
      field: string;
    }>;
  }>;
}

/**
 * Mapeia status do WhatsApp para status interno do SIGA.
 */
function mapWhatsAppStatus(metaStatus: string): string {
  const map: Record<string, string> = {
    sent: "sent",
    delivered: "delivered",
    read: "delivered",
    failed: "failed",
  };
  return map[metaStatus] || "unknown";
}

/**
 * Processa webhook da Meta e atualiza status de entrega.
 */
export async function handleWhatsAppWebhook(payload: MetaWebhookEvent): Promise<void> {
  const db = await loadSgaAdminClient();

  // Extrair status updates do payload
  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      const statuses = change.value.statuses;

      if (!statuses || statuses.length === 0) {
        continue;
      }

      // Processar cada status update
      for (const statusUpdate of statuses) {
        // Buscar dispatch pelo external_message_id (message ID da Meta)
        const { data: dispatch, error: fetchError } = await db
          .from("communication_dispatches")
          .select("id, status")
          .eq("external_message_id", statusUpdate.id)
          .eq("provider", "meta")
          .maybeSingle();

        if (fetchError || !dispatch) {
          console.warn(`[WhatsAppWebhook] Dispatch not found for message ID: ${statusUpdate.id}`);
          continue;
        }

        // Mapear status
        const newStatus = mapWhatsAppStatus(statusUpdate.status);

        // Preparar update
        const updatePayload: Record<string, unknown> = {
          status: newStatus,
          updated_at: new Date().toISOString(),
        };

        // Se foi entregue, registar timestamp
        if (newStatus === "delivered") {
          updatePayload.delivered_at = new Date().toISOString();
        }

        // Se falhou, registar erro
        if (newStatus === "failed" && statusUpdate.errors && statusUpdate.errors.length > 0) {
          const errorMsg = statusUpdate.errors.map((e) => `${e.title} (${e.code})`).join("; ");
          updatePayload.error_details = `Meta: ${errorMsg}`;
        }

        const { error: updateError } = await db
          .from("communication_dispatches")
          .update(updatePayload)
          .eq("id", dispatch.id);

        if (updateError) {
          console.error(`[WhatsAppWebhook] Failed to update dispatch: ${updateError.message}`);
          continue;
        }

        console.log(`[WhatsAppWebhook] Updated dispatch ${dispatch.id} to status: ${newStatus}`);
      }
    }
  }
}

/**
 * Verifica assinatura do webhook da Meta.
 *
 * Meta envia:
 * - Header X-Hub-Signature-256: sha256=<HMAC-SHA256>
 *
 * HMAC é computado com o raw request body e o app secret.
 */
export async function verifyMetaWebhookSignature(
  body: string,
  signature: string,
  appSecret: string,
): Promise<boolean> {
  // A Meta envia no formato `sha256=<hash>`.
  const [algorithm, hash] = signature.split("=");

  if (algorithm !== "sha256" || !hash) {
    console.warn("[WhatsAppWebhook] Invalid signature algorithm:", algorithm);
    return false;
  }

  const computed = await hmacHex("SHA-256", appSecret, body);
  return signaturesMatch(computed, hash);
}

/**
 * Comparação segura contra timing attacks.
 */
