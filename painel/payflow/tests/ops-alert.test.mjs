import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAlertPayload,
  dispatchPayflowAlert,
  isAlertablePayflowEvent,
  sanitizeAlertFields,
} from "../lib/ops-alert.ts";

test("alerts omit IBAN, names and only fire on operational failures", async () => {
  assert.equal(isAlertablePayflowEvent("bank_transfer.verify.rejected"), true);
  assert.equal(isAlertablePayflowEvent("siga.settlement.notify_failed"), true);
  assert.equal(isAlertablePayflowEvent("education.sync.ok"), false);

  const sanitized = sanitizeAlertFields({
    school_id: "school-a",
    payment_id: "pay_1",
    code: "amount_mismatch",
    iban: "AO06000000000000000000000",
    customer: "Maria",
  });
  assert.equal(sanitized.school_id, "school-a");
  assert.equal("iban" in sanitized, false);
  assert.equal("customer" in sanitized, false);

  const payload = buildAlertPayload("payment.refund.ok", { school_id: "school-a", iban: "AO06" });
  assert.equal(payload.app, "payflow");
  assert.equal("iban" in payload, false);

  const skipped = await dispatchPayflowAlert("education.sync.ok", { school_id: "school-a" }, {
    webhookUrl: "https://alerts.example/hook",
    fetchImpl: async () => {
      throw new Error("should not fetch");
    },
  });
  assert.equal(skipped.sent, false);
  if (!skipped.sent) assert.equal(skipped.reason, "not_alertable");

  const quiet = await dispatchPayflowAlert("payment.refund.ok", { school_id: "school-a" }, {
    webhookUrl: null,
  });
  assert.equal(quiet.sent, false);
  if (!quiet.sent) assert.equal(quiet.reason, "not_configured");

  let posted = null;
  const sent = await dispatchPayflowAlert("bank_api.ingest.rejected", { school_id: "school-a", code: "not_found" }, {
    webhookUrl: "https://alerts.example/hook",
    fetchImpl: async (url, init) => {
      posted = { url, body: JSON.parse(String(init.body)) };
      return { ok: true };
    },
  });
  assert.equal(sent.sent, true);
  assert.equal(posted.url, "https://alerts.example/hook");
  assert.equal(posted.body.event, "bank_api.ingest.rejected");
  assert.equal("iban" in posted.body, false);
});
