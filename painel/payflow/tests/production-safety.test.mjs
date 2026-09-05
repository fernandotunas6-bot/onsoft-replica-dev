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

test("statement import matches reference/amount/currency and never pays from CSV parse alone", async () => {
  const parser = await readFile(path.join(root, "lib/bank-statement.ts"), "utf8");
  const importRoute = await readFile(
    path.join(root, "app/api/v1/bank-statements/import/route.ts"),
    "utf8",
  );

  assert.match(parser, /amount_mismatch/);
  assert.match(parser, /unknown_reference/);
  assert.doesNotMatch(parser, /status: "paid"/);
  assert.match(importRoute, /eq\(payments\.schoolId, requestedSchoolId\)/);
  assert.match(importRoute, /source: "bank_statement"/);
  assert.match(importRoute, /dry_run: !apply/);
});

test("admin login is fail-closed outside sandbox and SSO uses exchange with redirect guard", async () => {
  const login = await readFile(path.join(root, "app/api/v1/admin/login/route.ts"), "utf8");
  const exchange = await readFile(path.join(root, "app/api/v1/sso/exchange/route.ts"), "utf8");

  assert.match(login, /use_sso_exchange/);
  assert.match(login, /isSandboxRuntime\(\)/);
  assert.doesNotMatch(login, /NODE_ENV !== "production"/);
  assert.match(login, /school_required/);
  assert.match(exchange, /status: 303/);
  assert.match(exchange, /open redirect/);
  assert.match(exchange, /redirect_to/);
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
  assert.equal(await verifySsoAssertion(`${assertion.slice(0, -1)}x`, secret, now), null);
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
