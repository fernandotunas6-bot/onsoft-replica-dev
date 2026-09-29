import type { Json, TablesUpdate } from "@/integrations/supabase/types";
import { createFileRoute } from "@tanstack/react-router";
import { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import {
  resolveResendWebhookSecret,
  verifyResendWebhookSignature,
} from "@/features/integrations/resend-webhook-signature";
import { errorMessage } from "@/lib/error-message";

// style-check: route-exempt — webhook HTTP Resend para entrega, aberturas e bounces.

interface ResendWebhookPayload {
  type:
    | "email.sent"
    | "email.delivered"
    | "email.delivery_delayed"
    | "email.complained"
    | "email.bounced"
    | "email.opened"
    | "email.clicked";
  created_at: string;
  data: {
    created_at?: string;
    email_id: string;
    from: string;
    to: string[];
    subject?: string;
  };
}

export const Route = createFileRoute("/api/integrations/resend/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Falha fechada: sem segredo configurado não se aceitam eventos, em vez
        // de aceitar tudo como antes.
        const secret = resolveResendWebhookSecret();
        if (!secret) {
          return Response.json({ ok: false, message: "Webhook não configurado." }, { status: 500 });
        }

        // O corpo tem de ser lido como texto: a assinatura cobre os bytes
        // exactos recebidos, e voltar a serializar o JSON invalidaria-a.
        const rawBody = await request.text();
        const signature = await verifyResendWebhookSignature({
          payload: rawBody,
          svixId: request.headers.get("svix-id"),
          svixTimestamp: request.headers.get("svix-timestamp"),
          svixSignature: request.headers.get("svix-signature"),
          secret,
        });

        if (!signature.valid) {
          return Response.json({ ok: false, message: "Assinatura inválida." }, { status: 401 });
        }

        let payload: ResendWebhookPayload;
        try {
          payload = JSON.parse(rawBody) as ResendWebhookPayload;
        } catch {
          return Response.json({ ok: false, message: "Payload JSON inválido." }, { status: 400 });
        }

        if (!payload?.type || !payload?.data?.email_id) {
          return Response.json(
            { ok: false, message: "Evento de webhook em falta ou incompleto." },
            { status: 400 },
          );
        }

        const emailId = payload.data.email_id;
        const eventType = payload.type;

        try {
          const db = await loadSgaAdminClient();

          // 1. Localiza o despacho correspondente pelo external_message_id
          const { data: dispatch } = await db
            .from("communication_dispatches")
            .select("id, status")
            .eq("external_message_id", emailId)
            .maybeSingle();

          let newStatus: NonNullable<TablesUpdate<"communication_dispatches">["status"]> | null =
            null;
          switch (eventType) {
            case "email.delivered":
              newStatus = "delivered";
              break;
            case "email.opened":
              newStatus = "opened";
              break;
            case "email.clicked":
              newStatus = "clicked";
              break;
            case "email.bounced":
              newStatus = "bounced";
              break;
            case "email.complained":
              newStatus = "failed";
              break;
            case "email.sent":
              newStatus = "sent";
              break;
          }

          if (dispatch?.id) {
            // Atualiza status do despacho
            if (newStatus) {
              await db
                .from("communication_dispatches")
                .update({
                  status: newStatus,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", dispatch.id);
            }

            // Grava evento no histórico de auditoria
            await db.from("communication_events").insert({
              dispatch_id: dispatch.id,
              provider: "resend",
              event_type: eventType.replace("email.", ""),
              payload: payload as unknown as Json,
              occurred_at: payload.created_at || new Date().toISOString(),
            });
          }

          return Response.json({ ok: true, received: true });
        } catch (err) {
          return Response.json(
            { ok: false, message: errorMessage(err, "Erro ao processar webhook") },
            { status: 500 },
          );
        }
      },
    },
  },
  component: ResendWebhookPlaceholder,
});

function ResendWebhookPlaceholder() {
  return (
    <main className="mx-auto max-w-lg px-5 py-16 text-center">
      <h1 className="font-display text-lg font-extrabold text-foreground">Webhook Resend</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Endpoint oficial para receção de eventos de entrega, leitura e bounces do Resend.
      </p>
    </main>
  );
}
