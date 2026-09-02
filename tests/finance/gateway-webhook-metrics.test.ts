import { describe, expect, it } from "vitest";
import {
  aggregateGatewayWebhookMetrics,
  type GatewayWebhookEventRow,
} from "@/features/finance/gateway-webhook-metrics";

const NOW = Date.parse("2026-08-28T12:00:00.000Z");

function event(
  partial: Partial<GatewayWebhookEventRow> & Pick<GatewayWebhookEventRow, "ok" | "created_at">,
): GatewayWebhookEventRow {
  return {
    id: partial.id ?? "evt-1",
    school_id: partial.school_id ?? "school-1",
    channel: partial.channel ?? "multicaixa_express",
    http_status: partial.http_status ?? (partial.ok ? 200 : 401),
    ok: partial.ok,
    message: partial.message ?? "test",
    reference: partial.reference ?? "****6789",
    invoice_id: partial.invoice_id ?? null,
    amount: partial.amount ?? 1000,
    created_at: partial.created_at,
    school_name: partial.school_name ?? "Escola A",
    tenant_name: partial.tenant_name ?? "Escola A",
    tenant_slug: partial.tenant_slug ?? "escola-a",
  };
}

describe("aggregateGatewayWebhookMetrics", () => {
  it("conta totais 24h e 7d", () => {
    const events = [
      event({ ok: true, created_at: "2026-08-28T11:00:00.000Z" }),
      event({ ok: false, created_at: "2026-08-28T10:00:00.000Z", school_id: "school-2" }),
      event({ ok: false, created_at: "2026-08-25T10:00:00.000Z", school_id: "school-2" }),
      event({ ok: true, created_at: "2026-08-10T10:00:00.000Z" }),
    ];

    const metrics = aggregateGatewayWebhookMetrics(events, NOW);

    expect(metrics.summary.last24h).toEqual({ total: 2, ok: 1, failed: 1 });
    expect(metrics.summary.last7d).toEqual({ total: 3, ok: 1, failed: 2 });
  });

  it("agrupa falhas por escola na última semana", () => {
    const events = [
      event({ ok: false, created_at: "2026-08-27T10:00:00.000Z", school_id: "s1" }),
      event({ ok: false, created_at: "2026-08-26T10:00:00.000Z", school_id: "s1" }),
      event({ ok: false, created_at: "2026-08-26T09:00:00.000Z", school_id: "s2", school_name: "B" }),
    ];

    const metrics = aggregateGatewayWebhookMetrics(events, NOW);

    expect(metrics.schoolsWithFailures7d).toEqual([
      { school_id: "s1", school_name: "Escola A", tenant_slug: "escola-a", failures: 2 },
      { school_id: "s2", school_name: "B", tenant_slug: "escola-a", failures: 1 },
    ]);
  });

  it("resume falhas por canal nas últimas 24h", () => {
    const events = [
      event({ ok: true, channel: "multicaixa_express", created_at: "2026-08-28T08:00:00.000Z" }),
      event({ ok: false, channel: "unitel_money", created_at: "2026-08-28T09:00:00.000Z" }),
    ];

    const metrics = aggregateGatewayWebhookMetrics(events, NOW);

    expect(metrics.summary.byChannel.multicaixa_express).toEqual({ total24h: 1, failed24h: 0 });
    expect(metrics.summary.byChannel.unitel_money).toEqual({ total24h: 1, failed24h: 1 });
    expect(metrics.recentFailures).toHaveLength(1);
  });
});
