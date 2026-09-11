import { createFileRoute } from "@tanstack/react-router";
import { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";

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
        let payload: ResendWebhookPayload;
        try {
          payload = (await request.json()) as ResendWebhookPayload;
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

          let newStatus: string | null = null;
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
              payload: payload as unknown as Record<string, unknown>,
              occurred_at: payload.created_at || new Date().toISOString(),
            });
          }

          return Response.json({ ok: true, received: true });
        } catch (err: any) {
          return Response.json(
            { ok: false, message: err.message || "Erro ao processar webhook" },
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
