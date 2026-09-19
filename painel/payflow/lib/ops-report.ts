import { dispatchPayflowAlert } from "@/lib/ops-alert";
import { logPayflowEvent } from "@/lib/ops-log";
import { getAlertWebhookUrl } from "@/lib/runtime";

type OpsScalar = string | number | boolean | null;

export function reportPayflowEvent(event: string, fields: Record<string, OpsScalar> = {}) {
  logPayflowEvent(event, fields);
  void dispatchPayflowAlert(event, fields, { webhookUrl: getAlertWebhookUrl() });
}
