import assert from "node:assert/strict";
import test from "node:test";

import {
  bankConnectorEligibility,
  mapConnectorMovement,
  parseConnectorPayload,
} from "../lib/bank-connector.ts";
import { resolveTrustedHttpsUrl } from "../lib/trusted-url.ts";

test("bank connector stays fail-closed without HTTPS URL and key", () => {
  const missing = bankConnectorEligibility({
    connectorUrl: null,
    connectorKey: "long-enough-connector-key",
    schoolId: "school-a",
  });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.code, "bank_connector_not_configured");

  const shortKey = bankConnectorEligibility({
    connectorUrl: "https://bank.example/movements",
    connectorKey: "short",
    schoolId: "school-a",
  });
  assert.equal(shortKey.ok, false);
  if (!shortKey.ok) assert.equal(shortKey.code, "bank_connector_key_required");

  const ok = bankConnectorEligibility({
    connectorUrl: "https://bank.example/movements",
    connectorKey: "long-enough-connector-key",
    schoolId: "school-a",
  });
  assert.equal(ok.ok, true);
});

test("trusted connector URLs reject http except localhost", () => {
  assert.equal(resolveTrustedHttpsUrl("https://bank.example/movements"), "https://bank.example/movements");
  assert.equal(resolveTrustedHttpsUrl("http://evil.example/movements"), null);
  assert.equal(resolveTrustedHttpsUrl("http://localhost:8787/movements"), "http://localhost:8787/movements");
});

test("connector movements cannot spoof another school", () => {
  const spoof = mapConnectorMovement(
    {
      school_id: "school-b",
      transfer_reference: "PF-TF-20260905-ABC123DEAD",
      amount: 150000,
      currency: "AOA",
      bank_transaction_id: "MOV-1",
      booked_at: "2026-09-05T10:00:00.000Z",
    },
    "school-a",
  );
  assert.equal(spoof.ok, false);
  if (!spoof.ok) assert.equal(spoof.code, "transfer_school_mismatch");

  const ok = mapConnectorMovement(
    {
      transfer_reference: "pf-tf-20260905-abc123dead",
      amount: 150000,
      currency: "aoa",
      bank_transaction_id: "MOV-1",
      booked_at: "2026-09-05T10:00:00.000Z",
    },
    "school-a",
  );
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.movement.transfer_reference, "PF-TF-20260905-ABC123DEAD");

  assert.deepEqual(parseConnectorPayload({ movements: [{ id: 1 }] }).length, 1);
  assert.deepEqual(parseConnectorPayload({ nope: true }), []);
});
