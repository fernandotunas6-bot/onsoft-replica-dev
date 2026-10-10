import type { SupabaseClient } from "@supabase/supabase-js";
import { checkGatewayFailureRateAlert } from "@/features/finance/gateway-failure-rate-alert";
import { isMissingTable } from "@/integrations/supabase/server-error";

export type GatewayWebhookEventMeta = {
  channel: string;
  reference: string;
  amount: number;
  invoiceId: string | null;
  externalId: string | null;
  schoolId: string | null;
  provider: string | null;
  devMode: boolean;
};

export type GatewayWebhookHandlerResult = {
  ok: boolean;
  status: number;
  message: string;
  receiptNumber?: string | null;
  planSettled?: boolean;
};

function maskReference(reference: string) {
  const clean = reference.replace(/\s+/g, "");
  if (clean.length <= 4) return "****";
  return `${"*".repeat(Math.max(0, clean.length - 4))}${clean.slice(-4)}`;
}

/** Persiste evento de webhook (service role). Ignora se tabela ainda não aplicada no SGA. */
export async function recordGatewayWebhookEvent(
  db: SupabaseClient,
  meta: GatewayWebhookEventMeta,
  result: GatewayWebhookHandlerResult,
) {
  const row = {
    school_id: meta.schoolId,
    channel: meta.channel,
    http_status: result.status,
    ok: result.ok,
    message: result.message.slice(0, 500),
    reference: maskReference(meta.reference),
    invoice_id: meta.invoiceId,
    amount: meta.amount,
    provider: meta.provider,
    dev_mode: meta.devMode,
    external_id: meta.externalId?.slice(0, 120) ?? null,
  };

  const { error } = await db.from("finance_gateway_webhook_events").insert(row);
  if (error && !isMissingTable(error)) {
    console.warn("[gateway-webhook] telemetry insert:", error.message);
  }

  const level = result.ok ? "info" : "warn";
  console[level](
    JSON.stringify({
      tag: "gateway-webhook",
      ok: result.ok,
      status: result.status,
      channel: meta.channel,
      schoolId: meta.schoolId,
      invoiceId: meta.invoiceId,
      reference: row.reference,
      amount: meta.amount,
      message: result.message,
    }),
  );

  if (!result.ok && result.status >= 400) {
    await notifyGatewayFailureSlack(meta, result).catch((err) => {
      console.warn("[gateway-webhook] slack alert:", err instanceof Error ? err.message : err);
    });
    void checkGatewayFailureRateAlert(db).catch((err) => {
      console.warn("[gateway-failure-rate-alert]", err instanceof Error ? err.message : err);
    });
  }
}

async function notifyGatewayFailureSlack(
  meta: GatewayWebhookEventMeta,
  result: GatewayWebhookHandlerResult,
) {
  const webhook = process.env.SIGA_GATEWAY_ALERT_SLACK_URL?.trim();
  if (!webhook) return;

  const text = [
    `Gateway ${meta.channel} falhou (HTTP ${result.status})`,
    meta.schoolId ? `schoolId=${meta.schoolId}` : "schoolId=—",
    meta.invoiceId ? `invoiceId=${meta.invoiceId}` : null,
    `ref=${maskReference(meta.reference)} amount=${meta.amount}`,
    result.message,
  ]
    .filter(Boolean)
    .join(" · ");

  const res = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Slack HTTP ${res.status}: ${body.slice(0, 120)}`);
  }
}
