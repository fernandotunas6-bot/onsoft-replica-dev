export type GatewayWebhookEventRow = {
  id: string;
  school_id: string | null;
  channel: string;
  http_status: number;
  ok: boolean;
  message: string;
  reference: string | null;
  invoice_id: string | null;
  amount: number | null;
  created_at: string;
  school_name?: string | null;
  tenant_name?: string | null;
  tenant_slug?: string | null;
};

export type GatewayWebhookWindowSummary = {
  total: number;
  ok: number;
  failed: number;
};

export type GatewayWebhookMetrics = {
  available: boolean;
  summary: {
    last24h: GatewayWebhookWindowSummary;
    last7d: GatewayWebhookWindowSummary;
    byChannel: Record<string, { total24h: number; failed24h: number }>;
  };
  recentFailures: GatewayWebhookEventRow[];
  schoolsWithFailures7d: Array<{
    school_id: string;
    school_name: string;
    tenant_slug: string | null;
    failures: number;
  }>;
  lastRateAlert: GatewayWebhookRateAlert | null;
};

export type GatewayWebhookRateAlert = {
  created_at: string;
  failure_rate: number;
  total_24h: number;
  failed_24h: number;
  reason: string;
};

export function emptyGatewayWebhookMetrics(): GatewayWebhookMetrics {
  return {
    available: false,
    summary: {
      last24h: { total: 0, ok: 0, failed: 0 },
      last7d: { total: 0, ok: 0, failed: 0 },
      byChannel: {},
    },
    recentFailures: [],
    schoolsWithFailures7d: [],
    lastRateAlert: null,
  };
}

function windowSummary(events: GatewayWebhookEventRow[], sinceMs: number, nowMs: number) {
  const inWindow = events.filter((event) => {
    const ts = Date.parse(event.created_at);
    return Number.isFinite(ts) && ts >= sinceMs && ts <= nowMs;
  });
  const ok = inWindow.filter((event) => event.ok).length;
  return {
    total: inWindow.length,
    ok,
    failed: inWindow.length - ok,
  };
}

/** Agrega eventos de webhook para o dashboard ADMIN (função pura — testável). */
export function aggregateGatewayWebhookMetrics(
  events: GatewayWebhookEventRow[],
  nowMs = Date.now(),
): GatewayWebhookMetrics {
  const ms24h = 24 * 60 * 60 * 1000;
  const ms7d = 7 * ms24h;
  const since24h = nowMs - ms24h;
  const since7d = nowMs - ms7d;

  const last24h = windowSummary(events, since24h, nowMs);
  const last7d = windowSummary(events, since7d, nowMs);

  const byChannel: Record<string, { total24h: number; failed24h: number }> = {};
  for (const event of events) {
    const ts = Date.parse(event.created_at);
    if (!Number.isFinite(ts) || ts < since24h) continue;
    const bucket = byChannel[event.channel] ?? { total24h: 0, failed24h: 0 };
    bucket.total24h += 1;
    if (!event.ok) bucket.failed24h += 1;
    byChannel[event.channel] = bucket;
  }

  const recentFailures = events.filter((event) => !event.ok).slice(0, 25);

  const schoolFailures = new Map<
    string,
    { school_name: string; tenant_slug: string | null; failures: number }
  >();
  for (const event of events) {
    if (event.ok || !event.school_id) continue;
    const ts = Date.parse(event.created_at);
    if (!Number.isFinite(ts) || ts < since7d) continue;
    const existing = schoolFailures.get(event.school_id) ?? {
      school_name: event.school_name ?? event.school_id,
      tenant_slug: event.tenant_slug ?? null,
      failures: 0,
    };
    existing.failures += 1;
    schoolFailures.set(event.school_id, existing);
  }

  const schoolsWithFailures7d = [...schoolFailures.entries()]
    .map(([school_id, row]) => ({ school_id, ...row }))
    .sort((a, b) => b.failures - a.failures)
    .slice(0, 10);

  return {
    available: true,
    summary: { last24h, last7d, byChannel },
    recentFailures,
    schoolsWithFailures7d,
    lastRateAlert: null,
  };
}
