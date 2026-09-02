import type { SupabaseClient } from "@supabase/supabase-js";
import type { GatewayWebhookWindowSummary } from "@/features/finance/gateway-webhook-metrics";
import { sendResendEmail } from "@/features/integrations/resend-client";

export type GatewayFailureRateAlertConfig = {
  slackUrl: string | null;
  resendApiKey: string | null;
  emailTo: string[];
  emailFrom: string;
  threshold: number;
  minEvents: number;
  cooldownMs: number;
};

export type GatewayFailureRateAlertEvaluation = {
  alert: boolean;
  failureRate: number;
  reason: string;
};

const AUDIT_ACTION = "GATEWAY_FAILURE_RATE_ALERT";

export function parseGatewayFailureRateAlertConfig(
  env: NodeJS.ProcessEnv = process.env,
): GatewayFailureRateAlertConfig | null {
  const slackUrl =
    env.SIGA_GATEWAY_FAILURE_RATE_ALERT_SLACK_URL?.trim() ||
    env.SIGA_GATEWAY_ALERT_SLACK_URL?.trim() ||
    null;
  const resendApiKey = env.RESEND_API_KEY?.trim() || null;
  const emailTo = (env.SIGA_GATEWAY_FAILURE_RATE_ALERT_EMAIL_TO?.trim() ?? "")
    .split(/[,;]/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (!slackUrl && !(resendApiKey && emailTo.length)) return null;

  const thresholdRaw = Number(env.SIGA_GATEWAY_FAILURE_RATE_THRESHOLD ?? "0.25");
  const threshold = Number.isFinite(thresholdRaw)
    ? Math.min(1, Math.max(0, thresholdRaw))
    : 0.25;

  const minEventsRaw = Number(env.SIGA_GATEWAY_FAILURE_RATE_MIN_EVENTS ?? "5");
  const minEvents = Number.isFinite(minEventsRaw) ? Math.max(1, Math.floor(minEventsRaw)) : 5;

  const cooldownHoursRaw = Number(env.SIGA_GATEWAY_FAILURE_RATE_COOLDOWN_HOURS ?? "6");
  const cooldownHours = Number.isFinite(cooldownHoursRaw) ? Math.max(1, cooldownHoursRaw) : 6;

  return {
    slackUrl,
    resendApiKey,
    emailTo,
    emailFrom:
      env.SIGA_GATEWAY_FAILURE_RATE_ALERT_EMAIL_FROM?.trim() ||
      env.E2E_ALERT_EMAIL_FROM?.trim() ||
      "SIGA Plus Alertas <onboarding@resend.dev>",
    threshold,
    minEvents,
    cooldownMs: cooldownHours * 60 * 60 * 1000,
  };
}

/** Avalia se a taxa de falha 24h justifica alerta de plataforma (função pura). */
export function evaluateGatewayFailureRateAlert(
  summary: GatewayWebhookWindowSummary,
  config: Pick<GatewayFailureRateAlertConfig, "threshold" | "minEvents">,
): GatewayFailureRateAlertEvaluation {
  if (summary.total < config.minEvents) {
    return {
      alert: false,
      failureRate: summary.total ? summary.failed / summary.total : 0,
      reason: `Amostra insuficiente (${summary.total}/${config.minEvents} eventos).`,
    };
  }

  const failureRate = summary.failed / summary.total;
  if (failureRate < config.threshold) {
    return {
      alert: false,
      failureRate,
      reason: `Taxa ${(failureRate * 100).toFixed(1)}% abaixo do limiar ${(config.threshold * 100).toFixed(0)}%.`,
    };
  }

  return {
    alert: true,
    failureRate,
    reason: `Taxa de falha ${(failureRate * 100).toFixed(1)}% (${summary.failed}/${summary.total}) ≥ ${(config.threshold * 100).toFixed(0)}%.`,
  };
}

export function formatGatewayFailureRateAlertMessage(
  evaluation: GatewayFailureRateAlertEvaluation,
  summary: GatewayWebhookWindowSummary,
) {
  const title = "SIGA Plus — taxa de falha webhook gateway elevada (24h)";
  const lines = [
    title,
    evaluation.reason,
    `Total 24h: ${summary.total} · OK: ${summary.ok} · Falhas: ${summary.failed}`,
    "Ver ADMIN → Webhooks gateway ou `npm run siga:gateway-events-recent -- --failures-only`.",
  ];
  return { title, text: lines.join("\n"), lines };
}

function isMissingTable(error: { code?: string; message?: string } | null) {
  return Boolean(
    error &&
    (error.code === "42P01" ||
      error.code === "PGRST205" ||
      /schema cache|does not exist|relation .* does not exist/i.test(error.message ?? "")),
  );
}

async function wasAlertSentRecently(db: SupabaseClient, cooldownMs: number, nowMs: number) {
  const since = new Date(nowMs - cooldownMs).toISOString();
  const { data, error } = await db
    .from("saas_audit_logs")
    .select("created_at")
    .eq("action", AUDIT_ACTION)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) return false;
    throw error;
  }
  return Boolean(data?.created_at);
}

async function sendSlack(webhook: string, text: string) {
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

async function sendEmail(
  apiKey: string,
  from: string,
  to: string[],
  subject: string,
  html: string,
) {
  await sendResendEmail({ apiKey, from, to, subject, html });
}

async function recordRateAlertSent(
  db: SupabaseClient,
  evaluation: GatewayFailureRateAlertEvaluation,
  summary: GatewayWebhookWindowSummary,
) {
  const { error } = await db.from("saas_audit_logs").insert({
    action: AUDIT_ACTION,
    entity: "gateway_webhook",
    metadata: {
      failure_rate: evaluation.failureRate,
      total_24h: summary.total,
      failed_24h: summary.failed,
      reason: evaluation.reason,
    },
  });
  if (error && !isMissingTable(error)) {
    console.warn("[gateway-failure-rate-alert] audit insert:", error.message);
  }
}

/** Verifica taxa 24h e envia alerta Slack/e-mail se acima do limiar (com cooldown). */
export async function checkGatewayFailureRateAlert(
  db: SupabaseClient,
  nowMs = Date.now(),
): Promise<{ checked: boolean; alerted: boolean; reason: string }> {
  const config = parseGatewayFailureRateAlertConfig();
  if (!config) {
    return { checked: false, alerted: false, reason: "Alertas de taxa não configurados." };
  }

  const since = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db
    .from("finance_gateway_webhook_events")
    .select("ok, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) {
    if (isMissingTable(error)) {
      return { checked: false, alerted: false, reason: "Tabela de telemetria em falta." };
    }
    throw error;
  }

  const rows = data ?? [];
  const summary: GatewayWebhookWindowSummary = {
    total: rows.length,
    ok: rows.filter((row) => row.ok).length,
    failed: rows.filter((row) => !row.ok).length,
  };

  const evaluation = evaluateGatewayFailureRateAlert(summary, config);
  if (!evaluation.alert) {
    return { checked: true, alerted: false, reason: evaluation.reason };
  }

  if (await wasAlertSentRecently(db, config.cooldownMs, nowMs)) {
    return { checked: true, alerted: false, reason: "Cooldown activo — alerta já enviado." };
  }

  const message = formatGatewayFailureRateAlertMessage(evaluation, summary);

  if (config.slackUrl) {
    await sendSlack(config.slackUrl, message.text);
  }
  if (config.resendApiKey && config.emailTo.length) {
    const html = message.lines.map((line) => `<p>${line}</p>`).join("\n");
    await sendEmail(config.resendApiKey, config.emailFrom, config.emailTo, message.title, html);
  }

  await recordRateAlertSent(db, evaluation, summary);

  console.warn(
    JSON.stringify({
      tag: "gateway-failure-rate-alert",
      failureRate: evaluation.failureRate,
      total: summary.total,
      failed: summary.failed,
    }),
  );

  return { checked: true, alerted: true, reason: evaluation.reason };
}
