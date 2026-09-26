import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

async function readSourceTree(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return readSourceTree(entryPath);
      if (!/\.(?:ts|tsx|js|mjs|json|md)$/.test(entry.name)) return "";
      return readFile(entryPath, "utf8");
    }),
  );
  return files.join("\n");
}

test("does not ship hard-coded demonstration identities or API keys", async () => {
  const source = [
    await readSourceTree(path.join(root, "app")),
    await readSourceTree(path.join(root, "lib")),
    await readFile(path.join(root, "README.md"), "utf8"),
  ].join("\n");

  const forbidden = [
    "pf_test_demo_2026",
    "SIGA-001",
    "1250227",
    "SANDBOX_API_KEY",
    "demoStudentAccess",
    "matchesDemoStudent",
  ];

  for (const value of forbidden) {
    assert.doesNotMatch(source, new RegExp(value), `found forbidden production literal: ${value}`);
  }
});

test("defaults to production and requires explicit sandbox activation", async () => {
  const runtime = await readFile(path.join(root, "lib/runtime.ts"), "utf8");
  const exampleEnvironment = await readFile(path.join(root, ".env.example"), "utf8");

  assert.match(runtime, /=== "sandbox"[\s\S]*\? "sandbox"[\s\S]*: "production"/);
  assert.doesNotMatch(runtime, /PAYFLOW_RUNTIME_MODE[^\n]*\|\|[^\n]*sandbox/);
  assert.match(exampleEnvironment, /^PAYFLOW_RUNTIME_MODE=production$/m);
});

test("browser confirmation routes are unavailable outside sandbox", async () => {
  const routes = [
    "app/api/v1/checkout/[token]/confirm/route.ts",
    "app/api/v1/student/payments/[id]/confirm/route.ts",
  ];

  for (const route of routes) {
    const source = await readFile(path.join(root, route), "utf8");
    assert.match(source, /if \(!isSandboxRuntime\(\)\)/, `${route} must fail closed`);
    assert.match(source, /provider !== "emis_sandbox"/, `${route} must reject real transfers`);
  }
});

test("integration endpoints and sandbox creation fail closed", async () => {
  const paymentsRoute = await readFile(path.join(root, "app/api/v1/payments/route.ts"), "utf8");
  const integration = await readFile(path.join(root, "lib/payflow.ts"), "utf8");
  const hosting = JSON.parse(await readFile(path.join(root, ".openai/hosting.json"), "utf8"));

  assert.match(paymentsRoute, /payment_provider_not_configured/);
  assert.match(
    paymentsRoute,
    /payment_method === "sandbox" && !isSandboxRuntime\(\)/,
  );
  assert.match(integration, /expected\.length < 24/);
  assert.doesNotMatch(integration, /Access-Control-Allow-Origin["']?\s*:\s*["']\*["']/);
  assert.equal(hosting.project_id, undefined);
});

test("supports real IBAN transfers without enabling production simulation", async () => {
  const paymentsRoute = await readFile(path.join(root, "app/api/v1/payments/route.ts"), "utf8");
  const studentRoute = await readFile(path.join(root, "app/api/v1/student/payments/route.ts"), "utf8");
  const hosting = JSON.parse(await readFile(path.join(root, ".openai/hosting.json"), "utf8"));

  assert.match(paymentsRoute, /payment_method:[\s\S]*bank_transfer/);
  assert.match(paymentsRoute, /scope: "platform"/);
  assert.match(studentRoute, /scope: "school"/);
  assert.match(studentRoute, /status: "pending"/);
  assert.equal(hosting.r2, "TRANSFER_PROOFS");
});

test("a submitted proof cannot mark a payment as paid or issue a receipt", async () => {
  const proofService = await readFile(path.join(root, "lib/bank-transfer-proofs.ts"), "utf8");

  assert.match(proofService, /status: "proof_submitted"/);
  assert.doesNotMatch(proofService, /status: "paid"/);
  assert.doesNotMatch(proofService, /paymentReceipts/);
});

test("bank verification matches authoritative movement data before issuing a receipt", async () => {
  const verifyRoute = await readFile(
    path.join(root, "app/api/v1/bank-transfers/verify/route.ts"),
    "utf8",
  );
  const verifyCore = await readFile(path.join(root, "lib/bank-transfer-verify.ts"), "utf8");

  assert.match(verifyRoute, /isIntegrationAuthorized/);
  assert.match(verifyRoute, /schoolScopeForVerification/);
  assert.match(verifyCore, /requiredSchoolId/);
  assert.match(verifyCore, /transfer_school_mismatch/);
  assert.match(verifyCore, /manual_review_requires_finance_admin/);
  assert.match(verifyCore, /expectedAmountMinor !== input\.amount/);
  assert.match(verifyCore, /expectedCurrency !== input\.currency/);
  assert.match(verifyCore, /bank_transaction_already_used/);
  assert.match(verifyCore, /proof_required_for_manual_review/);
  assert.match(verifyCore, /type: "bank_transfer\.verified"/);
  assert.match(verifyCore, /db\.insert\(paymentReceipts\)/);
});

test("bank API ingest forces bank_api source and requires school-scoped integration key", async () => {
  const ingest = await readFile(
    path.join(root, "app/api/v1/bank-movements/ingest/route.ts"),
    "utf8",
  );

  assert.match(ingest, /isIntegrationAuthorized/);
  assert.match(ingest, /school_id: z\.string/);
  assert.match(ingest, /source: "bank_api"/);
  assert.doesNotMatch(ingest, /manual_review/);
  assert.doesNotMatch(ingest, /requireAdminPermission/);
  assert.match(ingest, /bank_api\.ingest\.ok/);
});

test("statement import matches reference/amount/currency and never pays from CSV parse alone", async () => {
  const parser = await readFile(path.join(root, "lib/bank-statement.ts"), "utf8");
  const importRoute = await readFile(
    path.join(root, "app/api/v1/bank-statements/import/route.ts"),
    "utf8",
  );

  assert.match(parser, /amount_mismatch/);
  assert.match(parser, /unknown_reference/);
  assert.doesNotMatch(parser, /status: "paid"/);
  assert.match(importRoute, /requiredSchoolId: requestedSchoolId/);
  assert.match(importRoute, /source: "bank_statement"/);
  assert.match(importRoute, /dry_run: !apply/);
});

test("admin login is fail-closed outside sandbox and SSO uses exchange with redirect guard", async () => {
  const login = await readFile(path.join(root, "app/api/v1/admin/login/route.ts"), "utf8");
  const exchange = await readFile(path.join(root, "app/api/v1/sso/exchange/route.ts"), "utf8");
  const dashboard = await readFile(path.join(root, "app/admin/payflow-admin-dashboard.tsx"), "utf8");

  assert.match(login, /use_sso_exchange/);
  assert.match(login, /isSandboxRuntime\(\)/);
  assert.doesNotMatch(login, /NODE_ENV !== "production"/);
  assert.match(login, /school_required/);
  assert.match(exchange, /status: 303/);
  assert.match(exchange, /open redirect/);
  assert.match(exchange, /redirect_to/);
  assert.match(dashboard, /sandboxLoginAllowed/);
  assert.match(dashboard, /Acesso só via SIGA/);
  assert.match(dashboard, /sandboxEnabled/);
});

test("education sync preserves the complete SIGA academic and financial context", async () => {
  const syncRoute = await readFile(
    path.join(root, "app/api/v1/education/sync/route.ts"),
    "utf8",
  );
  const schema = await readFile(path.join(root, "db/schema.ts"), "utf8");
  const migration = await readFile(
    path.join(root, "drizzle/0004_majestic_triathlon.sql"),
    "utf8",
  );

  for (const field of [
    "enrollment_id",
    "academic_year_id",
    "class_id",
    "guardian_id",
    "financial_responsible",
    "enrollment_status",
    "student_school_mismatch",
    "invoice_school_mismatch",
    "bank_account_school_mismatch",
  ]) {
    assert.match(syncRoute, new RegExp(field), `education sync must require ${field}`);
  }

  assert.match(schema, /enrollmentId: text\("enrollment_id"\)/);
  assert.match(schema, /guardianId: text\("guardian_id"\)/);
  assert.match(schema, /financialResponsibleName/);
  assert.match(migration, /ADD `enrollment_id` text DEFAULT '' NOT NULL/);
  assert.match(migration, /students_enrollment_idx/);
  assert.match(migration, /students_guardian_idx/);
});

test("SSO assertions are signed, short-lived and reject tampering", async () => {
  const { createSsoAssertion, verifySsoAssertion } = await import("../lib/sso-assertion.ts");
  const now = Date.now();
  const nowSeconds = Math.floor(now / 1000);
  const secret = "payflow-sso-test-secret-with-at-least-32-characters";
  const claims = {
    iss: "siga-plus",
    aud: "payflow",
    sub: "user-001",
    tenant_id: "tenant-001",
    school_id: "school-001",
    role: "treasurer",
    iat: nowSeconds,
    exp: nowSeconds + 60,
    jti: "assertion-unique-001",
  };
  const assertion = await createSsoAssertion(claims, secret);

  assert.deepEqual(await verifySsoAssertion(assertion, secret, now), claims);
  const [header, payload, signature] = assertion.split(".");
  const tamperedSig = (signature.startsWith("A") ? "B" : "A") + signature.slice(1);
  assert.equal(await verifySsoAssertion(`${header}.${payload}.${tamperedSig}`, secret, now), null);
  assert.equal(await verifySsoAssertion(assertion, `${secret}-wrong`, now), null);
  assert.equal(await verifySsoAssertion(assertion, secret, now + 61_000), null);
});

test("bank account sync can upsert the school in the same request", async () => {
  const bankSync = await readFile(path.join(root, "app/api/v1/bank-accounts/sync/route.ts"), "utf8");
  assert.match(bankSync, /schoolUpsertSchema|school: schoolUpsertSchema/);
  assert.match(bankSync, /insert\(schools\)/);
  assert.match(bankSync, /school_not_found/);
});

test("administrative RBAC derives permissions server-side and scopes reconciliation by school", async () => {
  const sessions = await readFile(path.join(root, "lib/admin-session.ts"), "utf8");
  const exchange = await readFile(path.join(root, "app/api/v1/sso/exchange/route.ts"), "utf8");
  const reconciliation = await readFile(
    path.join(root, "app/api/v1/reconciliation/route.ts"),
    "utf8",
  );

  assert.match(sessions, /finance_admin:[\s\S]*reconciliation:write/);
  assert.match(sessions, /auditor:[\s\S]*audit:read/);
  assert.doesNotMatch(sessions, /auditor:[^\n]*reconciliation:write/);
  assert.match(exchange, /sso_assertion_replayed/);
  assert.match(exchange, /HttpOnly|sessionCookie/);
  assert.match(reconciliation, /eq\(payments\.schoolId, adminSession\.schoolId\)/);
});

test("refund keeps the receipt, requires finance_admin and stays school-scoped", async () => {
  const policy = await readFile(path.join(root, "lib/payment-refund-policy.ts"), "utf8");
  const refund = await readFile(path.join(root, "lib/payment-refund.ts"), "utf8");
  const route = await readFile(path.join(root, "app/api/v1/payments/[id]/refund/route.ts"), "utf8");
  const sessions = await readFile(path.join(root, "lib/admin-session.ts"), "utf8");
  const getPayment = await readFile(path.join(root, "app/api/v1/payments/[id]/route.ts"), "utf8");

  assert.match(sessions, /finance_admin:[\s\S]*payments:refund/);
  assert.doesNotMatch(sessions, /treasurer:[^\n]*payments:refund/);
  assert.match(policy, /refund_requires_finance_admin/);
  assert.match(refund, /receipt_preserved: true/);
  assert.doesNotMatch(refund, /delete\(paymentReceipts\)/);
  assert.match(refund, /type: "payment\.refunded"/);
  assert.match(route, /payments:refund/);
  assert.match(getPayment, /school_id/);
});

test("external alerts and bank pull stay fail-closed and never take a URL from the request", async () => {
  const alert = await readFile(path.join(root, "lib/ops-alert.ts"), "utf8");
  const report = await readFile(path.join(root, "lib/ops-report.ts"), "utf8");
  const runtime = await readFile(path.join(root, "lib/runtime.ts"), "utf8");
  const connector = await readFile(path.join(root, "lib/bank-connector.ts"), "utf8");
  const pull = await readFile(path.join(root, "app/api/v1/bank-movements/pull/route.ts"), "utf8");
  const emis = await readFile(path.join(root, "lib/providers/emis.ts"), "utf8");

  assert.match(alert, /ALERT_FIELD_ALLOWLIST/);
  assert.doesNotMatch(alert, /iban/);
  assert.match(report, /getAlertWebhookUrl/);
  assert.match(runtime, /PAYFLOW_ALERT_WEBHOOK_URL/);
  assert.match(runtime, /PAYFLOW_EMIS_HOMOLOGATED/);
  assert.match(connector, /bank_connector_not_configured/);
  assert.match(pull, /getBankConnectorUrl/);
  assert.match(pull, /bankConnectorEligibility/);
  assert.match(pull, /reconciliation:write/);
  assert.doesNotMatch(pull, /body\.connector_url|body\.url/);
  assert.match(emis, /payment_provider_not_configured/);
  assert.doesNotMatch(emis, /isEmisHomologated/);

  const emisWebhook = await readFile(path.join(root, "lib/providers/emis-webhook.ts"), "utf8");
  const emisWebhookRoute = await readFile(
    path.join(root, "app/api/v1/webhooks/emis/route.ts"),
    "utf8",
  );
  assert.match(emisWebhook, /isEmisProductionAdapterEnabled/);
  assert.match(emisWebhook, /return false/);
  assert.match(emisWebhook, /emis_adapter_not_ready/);
  assert.match(emisWebhookRoute, /settle: false/);
  assert.match(emisWebhookRoute, /verifyEmisWebhookSignature/);
  assert.doesNotMatch(emisWebhookRoute, /status:\s*"paid"|markPaymentPaid|executeBankTransfer/);
});

test("sandbox bank feed is unavailable outside sandbox and never settles alone", async () => {
  const feed = await readFile(
    path.join(root, "app/api/v1/bank-movements/sandbox-feed/route.ts"),
    "utf8",
  );
  const helper = await readFile(path.join(root, "lib/bank-sandbox-feed.ts"), "utf8");
  assert.match(feed, /isSandboxRuntime/);
  assert.match(feed, /sandbox_only/);
  assert.match(feed, /getBankConnectorKey/);
  assert.match(feed, /buildSandboxFeedMovements/);
  assert.match(helper, /buildSandboxFeedMovements/);
  assert.doesNotMatch(feed, /executeBankTransferVerification/);
  assert.doesNotMatch(helper, /executeBankTransferVerification/);
});

test("PayFlow notifies SIGA after paid or refunded without blocking the financial write", async () => {
  const notify = await readFile(path.join(root, "lib/siga-notify.ts"), "utf8");
  const verifyCore = await readFile(path.join(root, "lib/bank-transfer-verify.ts"), "utf8");
  const refund = await readFile(path.join(root, "lib/payment-refund.ts"), "utf8");

  assert.match(notify, /\/api\/finance\/payflow\/settlement/);
  assert.match(notify, /void fetch/);
  assert.match(notify, /getSigaBaseUrl/);
  assert.match(notify, /siga\.settlement\.notify_failed/);
  assert.match(notify, /reportPayflowEvent/);
  assert.match(verifyCore, /notifySigaSettlementBestEffort/);
  assert.match(refund, /notifySigaSettlementBestEffort/);
  assert.match(refund, /event: "payment.refunded"/);
});

test("public health exposes bank/alert/settlement/emis readiness without secrets", async () => {
  const runtime = await readFile(path.join(root, "lib/runtime.ts"), "utf8");
  const alert = await readFile(path.join(root, "lib/ops-alert.ts"), "utf8");

  assert.match(runtime, /bankConnectorConfigured/);
  assert.match(runtime, /alertWebhookConfigured/);
  assert.match(runtime, /sigaSettlementConfigured/);
  assert.match(runtime, /emisHomologated/);
  assert.doesNotMatch(runtime, /integrationApiKey|ssoSecret|connectorKey|webhookSecret/);
  assert.match(alert, /siga\.settlement\.notify_failed/);
  assert.match(alert, /http_status/);
});

test("student PIN has a per-student limit independent of IP, and login compares keys in constant time", async () => {
  const session = await readFile(path.join(root, "app/api/v1/student/session/route.ts"), "utf8");
  const login = await readFile(path.join(root, "app/api/v1/admin/login/route.ts"), "utf8");
  assert.match(session, /acct:\$\{parsed\.data\.school_code\}:\$\{parsed\.data\.student_code\}/);
  assert.match(session, /ACCOUNT_MAX_FAILED_ATTEMPTS/);
  assert.match(login, /safeEqual\(providedKey, configuredApiKey\)/);
  assert.doesNotMatch(login, /configuredApiKey === providedKey;/);
});

test("SSO redirect rejects backslash and control characters", async () => {
  const exchange = await readFile(path.join(root, "app/api/v1/sso/exchange/route.ts"), "utf8");
  assert.match(exchange, /\/\^\\\/\[\\\/\\\\\]\//);
  assert.match(exchange, /\\u0000-\\u001f/);
});
