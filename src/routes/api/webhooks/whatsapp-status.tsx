import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import {
  handleWhatsAppWebhook,
  verifyMetaWebhookSignature,
  type MetaWebhookEvent,
} from "@/features/otp/webhooks";

// style-check: route-exempt — webhook HTTP Meta de estado de WhatsApp.

/**
 * GET  /api/webhooks/whatsapp-status — verificação inicial da Meta (hub.challenge).
 * POST /api/webhooks/whatsapp-status — actualizações de entrega e leitura.
 *
 * Cabeçalho esperado no POST: `X-Hub-Signature-256` (sha256=<HMAC-SHA256>).
 */
export const Route = createFileRoute("/api/webhooks/whatsapp-status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const mode = url.searchParams.get("hub.mode");
          const challenge = url.searchParams.get("hub.challenge");
          const verifyToken = url.searchParams.get("hub.verify_token");

          const configuredToken =
            (typeof process !== "undefined" && process.env?.WHATSAPP_WEBHOOK_VERIFY_TOKEN) || "";

          // Sem token configurado nunca se confirma a subscrição: caso
          // contrário `verifyToken === configuredToken` seria verdade para um
          // pedido que também não enviasse token.
          if (configuredToken && mode === "subscribe" && verifyToken === configuredToken) {
            return new Response(challenge, { status: 200 });
          }

          return json({ error: "Invalid verification" }, { status: 403 });
        } catch (err) {
          console.error("[WhatsApp Webhook GET] Error:", err);
          return json({ error: "Internal server error" }, { status: 500 });
        }
      },

      POST: async ({ request }) => {
        try {
          // Corpo como texto: a assinatura cobre os bytes exactos recebidos.
          const body = await request.text();

          const signature = request.headers.get("x-hub-signature-256") || "";
          const appSecret = (typeof process !== "undefined" && process.env?.META_APP_SECRET) || "";

          if (!appSecret) {
            console.error("[WhatsApp Webhook] META_APP_SECRET not configured");
            return json({ error: "Not configured" }, { status: 500 });
          }

          if (!verifyMetaWebhookSignature(body, signature, appSecret)) {
            console.warn("[WhatsApp Webhook] Invalid signature");
            return json({ error: "Invalid signature" }, { status: 401 });
          }

          let payload: MetaWebhookEvent;
          try {
            payload = JSON.parse(body);
          } catch {
            return json({ error: "Invalid JSON" }, { status: 400 });
          }

          if (payload.object !== "whatsapp_business_account" || !Array.isArray(payload.entry)) {
            return json({ error: "Invalid structure" }, { status: 400 });
          }

          // A Meta espera resposta rápida; o processamento segue em paralelo.
          handleWhatsAppWebhook(payload).catch((err) => {
            console.error("[WhatsApp Webhook] Processing error:", err);
          });

          return json({ success: true }, { status: 200 });
        } catch (err) {
          console.error("[WhatsApp Webhook POST] Error:", err);
          return json({ error: "Internal server error" }, { status: 500 });
        }
      },
    },
  },
  component: WhatsAppWebhookPlaceholder,
});

function WhatsAppWebhookPlaceholder() {
  return (
    <main className="mx-auto max-w-lg px-5 py-16 text-center">
      <h1 className="font-display text-lg font-extrabold text-foreground">Webhook WhatsApp</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Endpoint de estado de entrega da Meta Cloud API. Requer assinatura válida.
      </p>
    </main>
  );
}
