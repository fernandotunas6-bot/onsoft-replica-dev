import { describe, expect, it } from "vitest";

import {
  payflowSettlementAuthorized,
  payflowSettlementInputSchema,
} from "@/features/finance/payflow-settlement";

const uuid = "11111111-1111-4111-8111-111111111111";

describe("payflow-settlement", () => {
  it("accepts paid and refunded events with AOA minor units", () => {
    const paid = payflowSettlementInputSchema.parse({
      event: "payment.paid",
      school_id: uuid,
      invoice_id: uuid,
      payment_id: "pay_abc123",
      amount_minor: 150000,
      currency: "AOA",
    });
    expect(paid.event).toBe("payment.paid");
    expect(
      payflowSettlementInputSchema.safeParse({ ...paid, currency: "USD" }).success,
    ).toBe(false);
  });

  it("rejects short integration keys and mismatched bearer tokens", () => {
    const previous = process.env.PAYFLOW_INTEGRATION_API_KEY;
    process.env.PAYFLOW_INTEGRATION_API_KEY = "payflow-integration-key-24chars";
    expect(payflowSettlementAuthorized("Bearer payflow-integration-key-24chars")).toBe(true);
    expect(payflowSettlementAuthorized("Bearer payflow-integration-key-24charX")).toBe(false);
    expect(payflowSettlementAuthorized(null)).toBe(false);
    process.env.PAYFLOW_INTEGRATION_API_KEY = "short";
    expect(payflowSettlementAuthorized("Bearer short")).toBe(false);
    process.env.PAYFLOW_INTEGRATION_API_KEY = previous;
  });
});
