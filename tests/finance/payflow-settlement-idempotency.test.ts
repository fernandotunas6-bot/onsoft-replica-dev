import { describe, expect, it, vi } from "vitest";

const settleGatewayPayment = vi.fn(async () => ({
  alreadyPaid: false as const,
  receiptId: "rec-1",
  receiptNumber: "REC-0001",
  invoiceStatus: "partially_paid",
  planSettled: false,
}));

vi.mock("@/features/finance/gateway-webhook-handler", () => ({ settleGatewayPayment }));
vi.mock("@/integrations/supabase/sga-admin", () => ({
  loadSgaAdminClient: async () => ({
    from: () => {
      const q: Record<string, unknown> = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({
          data: {
            id: "inv-1",
            status: "open",
            school_id: "school-1",
            amount: 100,
            discount_amount: 0,
          },
          error: null,
        }),
      };
      return q;
    },
  }),
}));

const { applyPayflowSettlement } = await import("@/features/finance/payflow-settlement");

describe("pagamento PayFlow", () => {
  it("passa o payment_id como chave de idempotência do recibo", async () => {
    await applyPayflowSettlement({
      event: "payment.paid",
      school_id: "school-1",
      invoice_id: "inv-1",
      payment_id: "pay-000123",
      amount_minor: 5_000,
      currency: "AOA",
    });

    expect(settleGatewayPayment).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ externalId: "pay-000123" }),
    );
  });
});
