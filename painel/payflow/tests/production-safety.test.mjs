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

  assert.match(verifyRoute, /isIntegrationAuthorized/);
  assert.match(verifyRoute, /expectedAmountMinor !== parsed\.data\.amount/);
  assert.match(verifyRoute, /expectedCurrency !== parsed\.data\.currency/);
  assert.match(verifyRoute, /bank_transaction_already_used/);
  assert.match(verifyRoute, /proof_required_for_manual_review/);
  assert.match(verifyRoute, /type: "bank_transfer\.verified"/);
  assert.match(verifyRoute, /db\.insert\(paymentReceipts\)/);
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
