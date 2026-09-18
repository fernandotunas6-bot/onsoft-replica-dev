#!/usr/bin/env node
/**
 * Alertas opcionais quando um job E2E falha na CI.
 *
 * Slack: secret SLACK_E2E_WEBHOOK_URL
 * E-mail: secrets RESEND_API_KEY + E2E_ALERT_EMAIL_TO (+ E2E_ALERT_EMAIL_FROM opcional)
 *
 * Uso local:
 *   NOTIFY_TITLE="Teste" SLACK_E2E_WEBHOOK_URL=... node scripts/siga/notify-ci-failure.mjs
 */
function buildSummary() {
  const title = process.env.NOTIFY_TITLE?.trim() || "SIGA Plus — E2E falhou";
  const context = process.env.NOTIFY_CONTEXT?.trim() || "";
  const repo = process.env.GITHUB_REPOSITORY ?? "local/repo";
  const workflow = process.env.GITHUB_WORKFLOW ?? "CI";
  const branch = process.env.GITHUB_REF_NAME ?? process.env.GITHUB_HEAD_REF ?? "";
  const runId = process.env.GITHUB_RUN_ID ?? "";
  const server = process.env.GITHUB_SERVER_URL ?? "https://github.com";
  const runUrl = runId ? `${server}/${repo}/actions/runs/${runId}` : "";

  const textLines = [
    title,
    `Workflow: ${workflow}`,
    repo !== "local/repo" ? `Repo: ${repo}` : null,
    branch ? `Branch: ${branch}` : null,
    context || null,
    runUrl ? `Run: ${runUrl}` : null,
    "",
    "Descarregue o artefacto playwright-e2e-*-report (traces HTML) no GitHub Actions.",
  ].filter(Boolean);

  return { title, textLines, runUrl, repo, workflow, branch, context };
}

async function notifySlack(webhook, summary) {
  const mrkdwn = [
    `*${summary.title}*`,
    `Workflow: \`${summary.workflow}\``,
    summary.repo !== "local/repo" ? `Repo: \`${summary.repo}\`` : null,
    summary.branch ? `Branch: \`${summary.branch}\`` : null,
    summary.context || null,
    summary.runUrl ? `<${summary.runUrl}|Abrir run no GitHub>` : null,
    "",
    "Artefacto *playwright-e2e-*-report* (traces HTML).",
  ]
    .filter(Boolean)
    .join("\n");

  const res = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: `${summary.title} — ${summary.repo}`,
      blocks: [{ type: "section", text: { type: "mrkdwn", text: mrkdwn } }],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Slack HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
}

async function notifyResend(apiKey, summary) {
  const toRaw = process.env.E2E_ALERT_EMAIL_TO?.trim() ?? "";
  const to = toRaw
    .split(/[,;]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (!to.length) throw new Error("E2E_ALERT_EMAIL_TO em falta.");

  const from = process.env.E2E_ALERT_EMAIL_FROM?.trim() || "SIGA Plus CI <onboarding@resend.dev>";
  const html = summary.textLines.map((line) => `<p>${line}</p>`).join("\n");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject: summary.title,
      html,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
}

const slack = process.env.SLACK_E2E_WEBHOOK_URL?.trim();
const resendKey = process.env.RESEND_API_KEY?.trim();
const emailTo = process.env.E2E_ALERT_EMAIL_TO?.trim();

if (!slack && !(resendKey && emailTo)) {
  console.log("notify-ci-failure: omitido (configure SLACK_E2E_WEBHOOK_URL ou Resend).");
  process.exit(0);
}

const summary = buildSummary();
let failed = false;

if (slack) {
  try {
    await notifySlack(slack, summary);
    console.log("notify-ci-failure: Slack OK.");
  } catch (error) {
    failed = true;
    console.error(`notify-ci-failure: Slack — ${error instanceof Error ? error.message : error}`);
  }
}

if (resendKey && emailTo) {
  try {
    await notifyResend(resendKey, summary);
    console.log("notify-ci-failure: e-mail OK.");
  } catch (error) {
    failed = true;
    console.error(`notify-ci-failure: Resend — ${error instanceof Error ? error.message : error}`);
  }
}

process.exit(failed ? 1 : 0);
