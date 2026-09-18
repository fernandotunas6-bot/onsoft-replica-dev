#!/usr/bin/env node
/**
 * Alerta de plataforma quando a taxa de falha de webhooks gateway (24h) excede o limiar.
 *
 * Slack: SIGA_GATEWAY_FAILURE_RATE_ALERT_SLACK_URL (fallback SIGA_GATEWAY_ALERT_SLACK_URL)
 * E-mail: RESEND_API_KEY + SIGA_GATEWAY_FAILURE_RATE_ALERT_EMAIL_TO
 *
 * Limiares (opcional):
 *   SIGA_GATEWAY_FAILURE_RATE_THRESHOLD=0.25
 *   SIGA_GATEWAY_FAILURE_RATE_MIN_EVENTS=5
 *   SIGA_GATEWAY_FAILURE_RATE_COOLDOWN_HOURS=6
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const AUDIT_ACTION = "GATEWAY_FAILURE_RATE_ALERT";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function loadEnv() {
  const envPath = resolve(root, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key && !process.env[key]) process.env[key] = value;
  }
}

function parseConfig() {
  const slackUrl =
    process.env.SIGA_GATEWAY_FAILURE_RATE_ALERT_SLACK_URL?.trim() ||
    process.env.SIGA_GATEWAY_ALERT_SLACK_URL?.trim() ||
    null;
  const resendApiKey = process.env.RESEND_API_KEY?.trim() || null;
  const emailTo = (process.env.SIGA_GATEWAY_FAILURE_RATE_ALERT_EMAIL_TO?.trim() ?? "")
    .split(/[,;]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (!slackUrl && !(resendApiKey && emailTo.length)) return null;

  const thresholdRaw = Number(process.env.SIGA_GATEWAY_FAILURE_RATE_THRESHOLD ?? "0.25");
  const threshold = Number.isFinite(thresholdRaw) ? Math.min(1, Math.max(0, thresholdRaw)) : 0.25;
  const minEventsRaw = Number(process.env.SIGA_GATEWAY_FAILURE_RATE_MIN_EVENTS ?? "5");
  const minEvents = Number.isFinite(minEventsRaw) ? Math.max(1, Math.floor(minEventsRaw)) : 5;
  const cooldownHoursRaw = Number(process.env.SIGA_GATEWAY_FAILURE_RATE_COOLDOWN_HOURS ?? "6");
  const cooldownHours = Number.isFinite(cooldownHoursRaw) ? Math.max(1, cooldownHoursRaw) : 6;

  return {
    slackUrl,
    resendApiKey,
    emailTo,
    emailFrom:
      process.env.SIGA_GATEWAY_FAILURE_RATE_ALERT_EMAIL_FROM?.trim() ||
      process.env.E2E_ALERT_EMAIL_FROM?.trim() ||
      "SIGA Plus Alertas <onboarding@resend.dev>",
    threshold,
    minEvents,
    cooldownMs: cooldownHours * 60 * 60 * 1000,
  };
}

function evaluate(summary, config) {
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

function isMissingTable(error) {
  return Boolean(
    error &&
    (error.code === "42P01" ||
      /schema cache|does not exist|relation .* does not exist/i.test(error.message ?? "")),
  );
}

async function sendSlack(webhook, text) {
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

async function sendEmail(apiKey, from, to, subject, html) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend HTTP ${res.status}: ${body.slice(0, 120)}`);
  }
}

if (process.env.SIGA_IGNORE_DOTENV !== "1") {
  loadEnv();
}

const url = process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim();
const secret =
  process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!url || !secret) {
  console.error("❌ SUPABASE_URL e SUPABASE_SECRET_KEY são obrigatórios.");
  process.exit(1);
}

const config = parseConfig();
if (!config) {
  console.log(
    "gateway-failure-rate-check: omitido (configure SIGA_GATEWAY_FAILURE_RATE_ALERT_SLACK_URL ou Resend).",
  );
  process.exit(0);
}

const db = createClient(url, secret, { auth: { persistSession: false } });
const nowMs = Date.now();
const since24h = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString();

const { data, error } = await db
  .from("finance_gateway_webhook_events")
  .select("ok")
  .gte("created_at", since24h)
  .limit(500);

if (error) {
  if (isMissingTable(error)) {
    console.log("gateway-failure-rate-check: tabela de telemetria em falta.");
    process.exit(0);
  }
  console.error("❌", error.message);
  process.exit(1);
}

const rows = data ?? [];
const summary = {
  total: rows.length,
  ok: rows.filter((row) => row.ok).length,
  failed: rows.filter((row) => !row.ok).length,
};

const evaluation = evaluate(summary, config);
if (!evaluation.alert) {
  console.log(`gateway-failure-rate-check: OK — ${evaluation.reason}`);
  process.exit(0);
}

const cooldownSince = new Date(nowMs - config.cooldownMs).toISOString();
const { data: recentAlert, error: auditErr } = await db
  .from("saas_audit_logs")
  .select("created_at")
  .eq("action", AUDIT_ACTION)
  .gte("created_at", cooldownSince)
  .limit(1)
  .maybeSingle();

if (auditErr && !isMissingTable(auditErr)) {
  console.error("❌", auditErr.message);
  process.exit(1);
}

if (recentAlert?.created_at) {
  console.log("gateway-failure-rate-check: cooldown activo — alerta já enviado.");
  process.exit(0);
}

const title = "SIGA Plus — taxa de falha webhook gateway elevada (24h)";
const lines = [
  title,
  evaluation.reason,
  `Total 24h: ${summary.total} · OK: ${summary.ok} · Falhas: ${summary.failed}`,
  "Ver ADMIN → Webhooks gateway ou npm run siga:gateway-events-recent -- --failures-only",
];
const text = lines.join("\n");

let failed = false;
if (config.slackUrl) {
  try {
    await sendSlack(config.slackUrl, text);
    console.log("gateway-failure-rate-check: Slack OK.");
  } catch (err) {
    failed = true;
    console.error(
      `gateway-failure-rate-check: Slack — ${err instanceof Error ? err.message : err}`,
    );
  }
}

if (config.resendApiKey && config.emailTo.length) {
  try {
    const html = lines.map((line) => `<p>${line}</p>`).join("\n");
    await sendEmail(config.resendApiKey, config.emailFrom, config.emailTo, title, html);
    console.log("gateway-failure-rate-check: e-mail OK.");
  } catch (err) {
    failed = true;
    console.error(
      `gateway-failure-rate-check: Resend — ${err instanceof Error ? err.message : err}`,
    );
  }
}

if (!failed) {
  await db.from("saas_audit_logs").insert({
    action: AUDIT_ACTION,
    entity: "gateway_webhook",
    metadata: {
      failure_rate: evaluation.failureRate,
      total_24h: summary.total,
      failed_24h: summary.failed,
      reason: evaluation.reason,
    },
  });
  console.log(`gateway-failure-rate-check: alerta enviado — ${evaluation.reason}`);
}

process.exit(failed ? 1 : 0);
