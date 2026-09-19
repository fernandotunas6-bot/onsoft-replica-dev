import assert from "node:assert/strict";
import test from "node:test";

import { refundEligibility } from "../lib/payment-refund-policy.ts";

const base = {
  paymentSchoolId: "school-a",
  requiredSchoolId: "school-a",
  actorRole: "finance_admin",
  reason: "Movimento duplicado no extrato",
};

test("refund requires finance_admin, school match, reason and a paid payment", () => {
  assert.equal(refundEligibility({ ...base, paymentStatus: "paid" }).ok, true);
  const treasurer = refundEligibility({ ...base, paymentStatus: "paid", actorRole: "treasurer" });
  assert.equal(treasurer.ok, false);
  if (!treasurer.ok) assert.equal(treasurer.code, "refund_requires_finance_admin");

  const otherSchool = refundEligibility({
    ...base,
    paymentStatus: "paid",
    paymentSchoolId: "school-b",
  });
  assert.equal(otherSchool.ok, false);
  if (!otherSchool.ok) assert.equal(otherSchool.code, "transfer_school_mismatch");

  const pending = refundEligibility({ ...base, paymentStatus: "pending" });
  assert.equal(pending.ok, false);
  if (!pending.ok) assert.equal(pending.code, "payment_not_paid");

  const short = refundEligibility({ ...base, paymentStatus: "paid", reason: "erro" });
  assert.equal(short.ok, false);

  const again = refundEligibility({ ...base, paymentStatus: "refunded" });
  assert.equal(again.ok, true);
  if (again.ok) assert.equal(again.idempotent, true);
});
