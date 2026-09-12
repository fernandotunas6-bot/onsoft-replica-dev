import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import {
  handleTwilioSmsWebhook,
  verifyTwilioWebhookSignature,
  type TwilioWebhookPayload,
} from "@/features/otp/webhooks";

// style-check: route-exempt — webhook HTTP Twilio de estado de SMS.

/**
 * POST /api/webhooks/twilio-sms
 *
 * Recebe actualizações de estado de SMS do Twilio (entregue, falhado, etc.).
 *
 * Cabeçalho esperado: `X-Twilio-Signature` (HMAC-SHA1 do URL + parâmetros).
 * Corpo: `MessageSid`, `MessageStatus`, `From`, `To` em form-urlencoded.
 */
export const Route = createFileRoute("/api/webhooks/twilio-sms")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.text();
          const params = new URLSearchParams(body);
          const rawParams = Object.fromEntries(params);
          const payload = rawParams as unknown as TwilioWebhookPayload;

          const signature = request.headers.get("x-twilio-signature") || "";
          const authToken =
            (typeof process !== "undefined" && process.env?.TWILIO_WEBHOOK_AUTH_TOKEN) || "";

          if (!authToken) {
            console.error("[Twilio Webhook] TWILIO_WEBHOOK_AUTH_TOKEN not configured");
            return json({ error: "Not configured" }, { status: 500 });
          }

          const url = new URL(request.url).href.split("?")[0];
          const isValid = verifyTwilioWebhookSignature(url, rawParams, signature, authToken);

          if (!isValid) {
            console.warn("[Twilio Webhook] Invalid signature");
            return json({ error: "Invalid signature" }, { status: 401 });
          }

          await handleTwilioSmsWebhook(payload);

          return json({ success: true });
        } catch (err) {
          console.error("[Twilio Webhook] Error:", err);
          return json({ error: "Internal server error" }, { status: 500 });
        }
      },
    },
  },
  component: TwilioWebhookPlaceholder,
});

function TwilioWebhookPlaceholder() {
  return (
    <main className="mx-auto max-w-lg px-5 py-16 text-center">
      <h1 className="font-display text-lg font-extrabold text-foreground">Webhook Twilio</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Endpoint de estado de entrega de SMS. Requer assinatura válida do Twilio.
      </p>
    </main>
  );
}
