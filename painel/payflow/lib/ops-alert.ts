const ALERT_FIELD_ALLOWLIST = new Set([
  "code",
  "school_id",
  "payment_id",
  "idempotent",
  "source",
  "count",
  "rejected",
  "http_status",
  "event",
]);

const ALERTABLE_EVENTS = new Set([
  "bank_transfer.verify.rejected",
  "bank_api.ingest.rejected",
  "bank_connector.pull.rejected",
  "bank_connector.pull.failed",
  "payment.refund.ok",
  "payment.refund.rejected",
  "siga.settlement.notify_failed",
  "emis.webhook.rejected",
  "emis.webhook.adapter_not_ready",
]);

export type AlertDispatchResult =
  | { sent: false; reason: "not_alertable" | "not_configured" | "webhook_failed" }
  | { sent: true };

export function isAlertablePayflowEvent(event: string) {
  return ALERTABLE_EVENTS.has(event) || event.endsWith(".rejected");
}

export function sanitizeAlertFields(fields: Record<string, unknown>) {
  const clean: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!ALERT_FIELD_ALLOWLIST.has(key)) continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
      clean[key] = value;
    }
  }
  return clean;
}

export function buildAlertPayload(event: string, fields: Record<string, unknown>) {
  return {
    app: "payflow",
    event,
    ts: new Date().toISOString(),
    ...sanitizeAlertFields(fields),
  };
}

export async function dispatchPayflowAlert(
  event: string,
  fields: Record<string, unknown>,
  options: {
    webhookUrl: string | null;
    fetchImpl?: typeof fetch;
  },
): Promise<AlertDispatchResult> {
  if (!isAlertablePayflowEvent(event)) {
    return { sent: false, reason: "not_alertable" };
  }
  if (!options.webhookUrl) {
    return { sent: false, reason: "not_configured" };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(options.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildAlertPayload(event, fields)),
    });
    if (!response.ok) return { sent: false, reason: "webhook_failed" };
    return { sent: true };
  } catch {
    return { sent: false, reason: "webhook_failed" };
  }
}
