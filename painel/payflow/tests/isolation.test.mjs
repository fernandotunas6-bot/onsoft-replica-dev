import assert from "node:assert/strict";
import test from "node:test";

import { matchStatementMovements, parseBankStatementCsv } from "../lib/bank-statement.ts";
import { schoolScopeForVerification } from "../lib/school-scope.ts";
import { foreignSchoolRecord, foreignStudentRecord } from "../lib/education-isolation.ts";
import { logPayflowEvent } from "../lib/ops-log.ts";
import { buildSigaSettlementPayload } from "../lib/siga-settlement-payload.ts";

test("statement matching ignores pending transfers from another school", () => {
  const csv =
    "referencia;valor;moeda;movimento;data\nPF-TF-20260905-OTHERSCH1;150,00;AOA;TX-9;2026-09-05\n";
  const movements = parseBankStatementCsv(csv);
  const matches = matchStatementMovements(
    movements,
    [
      {
        transferReference: "PF-TF-20260905-OTHERSCH1",
        expectedAmountMinor: 15_000,
        currency: "AOA",
        status: "awaiting_transfer",
        paymentStatus: "pending",
        schoolId: "school-b",
      },
    ],
    { schoolId: "school-a" },
  );
  assert.equal(matches[0].outcome, "unknown_reference");
});

test("education records cannot move between schools or students", () => {
  assert.equal(foreignSchoolRecord("school-a", "school-b"), true);
  assert.equal(foreignSchoolRecord("school-a", "school-a"), false);
  assert.equal(foreignSchoolRecord(null, "school-a"), false);
  assert.equal(foreignStudentRecord("stu-1", "stu-2"), true);
  assert.equal(foreignStudentRecord("stu-1", "stu-1"), false);
});

test("integration verification requires an explicit school and SSO cannot spoof another school", () => {
  const missing = schoolScopeForVerification({
    requestedSchoolId: undefined,
  });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.code, "school_required");

  const spoof = schoolScopeForVerification({
    adminSchoolId: "school-a",
    requestedSchoolId: "school-b",
  });
  assert.equal(spoof.ok, false);
  if (!spoof.ok) assert.equal(spoof.code, "transfer_school_mismatch");

  const ok = schoolScopeForVerification({
    adminSchoolId: "school-a",
  });
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.schoolId, "school-a");
});

test("operational logs are JSON and omit payer names", () => {
  const lines = [];
  const original = console.info;
  console.info = (value) => {
    lines.push(String(value));
  };
  logPayflowEvent("bank_transfer.verify.ok", { school_id: "school-a", payment_id: "pay_1", source: "bank_statement" });
  console.info = original;
  const payload = JSON.parse(lines[0]);
  assert.equal(payload.app, "payflow");
  assert.equal(payload.event, "bank_transfer.verify.ok");
  assert.equal(payload.school_id, "school-a");
  assert.equal("customer" in payload, false);
  assert.equal("iban" in payload, false);
});

test("SIGA settlement payload requires school and invoice and drops incomplete notifies", () => {
  assert.equal(
    buildSigaSettlementPayload({
      event: "payment.paid",
      schoolId: "school-a",
      invoiceId: null,
      paymentId: "pay_1",
      amountMinor: 100,
      currency: "AOA",
    }),
    null,
  );
  const body = buildSigaSettlementPayload({
    event: "payment.refunded",
    schoolId: "school-a",
    invoiceId: "inv-1",
    paymentId: "pay_1",
    amountMinor: 150000,
    currency: "aoa",
    receiptCode: "REC-1",
    reason: "duplicado",
  });
  assert.equal(body?.event, "payment.refunded");
  assert.equal(body?.currency, "AOA");
  assert.equal(body?.invoice_id, "inv-1");
});
