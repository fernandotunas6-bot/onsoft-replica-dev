import { reportPayflowEvent } from "@/lib/ops-report";
import { getIntegrationApiKey, getSigaBaseUrl, isIntegrationConfigured } from "@/lib/runtime";
import {
  buildSigaSettlementPayload,
  type SigaSettlementEvent,
} from "@/lib/siga-settlement-payload";

export function notifySigaSettlementBestEffort(input: {
  event: SigaSettlementEvent;
  schoolId: string | null;
  invoiceId: string | null;
  paymentId: string;
  amountMinor: number;
  currency: string;
  receiptCode?: string | null;
  reason?: string | null;
}) {
  const payload = buildSigaSettlementPayload(input);
  const sigaOrigin = getSigaBaseUrl();
  if (!payload || !sigaOrigin || !isIntegrationConfigured()) {
    return;
  }

  void fetch(`${sigaOrigin}/api/finance/payflow/settlement`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getIntegrationApiKey()}`,
    },
    body: JSON.stringify(payload),
  })
    .then(async (response) => {
      if (response.ok) {
        reportPayflowEvent("siga.settlement.notify", {
          event: payload.event,
          school_id: payload.school_id,
          payment_id: payload.payment_id,
          http_status: response.status,
          ok: true,
        });
        return;
      }
      reportPayflowEvent("siga.settlement.notify_failed", {
        event: payload.event,
        school_id: payload.school_id,
        payment_id: payload.payment_id,
        http_status: response.status,
        ok: false,
      });
    })
    .catch(() => {
      reportPayflowEvent("siga.settlement.notify_failed", {
        event: payload.event,
        school_id: payload.school_id,
        payment_id: payload.payment_id,
        ok: false,
      });
    });
}
