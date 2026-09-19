import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSandboxFeedMovements,
  timingSafeEqualString,
} from "../lib/bank-sandbox-feed.ts";

test("sandbox feed builds at most one seeded movement and stays empty without seed", () => {
  assert.deepEqual(
    buildSandboxFeedMovements({
      schoolId: "school-aa",
      transferReference: "",
      amount: 1500000,
      currency: "AOA",
      bankTransactionId: "MOV-1",
      bookedAt: "2026-09-05T12:00:00.000Z",
    }),
    [],
  );

  const [row] = buildSandboxFeedMovements({
    schoolId: "school-aa",
    transferReference: "PF-TF-20260905-ABC123DEAD",
    amount: 1500000,
    currency: "aoa",
    bankTransactionId: "MOV-1",
    bookedAt: "2026-09-05T12:00:00.000Z",
  });
  assert.equal(row.transfer_reference, "PF-TF-20260905-ABC123DEAD");
  assert.equal(row.amount, 1500000);
  assert.equal(row.currency, "AOA");
  assert.equal(row.school_id, "school-aa");
});

test("sandbox connector key compare is length-safe", () => {
  assert.equal(timingSafeEqualString("abcdefghijklmnop", "abcdefghijklmnop"), true);
  assert.equal(timingSafeEqualString("abcdefghijklmnop", "abcdefghijklmnoX"), false);
  assert.equal(timingSafeEqualString("short", "abcdefghijklmnop"), false);
});
