import { describe, expect, it, vi } from "vitest";

/**
 * Uma cobrança paga ficava em "settling" para sempre se o Worker morresse entre
 * reclamar e liquidar. Passa a poder ser retomada depois de 10 min; a idempotência
 * por provider_charge_id impede um segundo recibo.
 */
vi.mock("@/lib/appypay.server", () => ({
  getAppyPayCharge: async () => ({
    id: "ch-1",
    merchantTransactionId: "S123",
    amount: 100,
    status: "Success",
    successful: true,
    message: null,
    raw: {},
  }),
}));
const settle = vi.fn(async () => ({
  alreadyPaid: true as const,
  receiptId: null,
  receiptNumber: null,
  planSettled: false,
}));
vi.mock("@/features/finance/gateway-webhook-handler", () => ({ settleGatewayPayment: settle }));

const { reconcileAppyPayCharge, STALE_SETTLING_MINUTES } =
  await import("@/features/finance/appypay-reconcile.server");

function db() {
  const updates: Array<{ values: Record<string, unknown>; or?: string }> = [];
  const from = () => {
    const entry: { values: Record<string, unknown>; or?: string } = { values: {} };
    const q: Record<string, unknown> = {};
    q["update"] = (values: Record<string, unknown>) => {
      entry.values = values;
      updates.push(entry);
      return q;
    };
    q["eq"] = () => q;
    q["neq"] = () => q;
    q["in"] = () => q;
    q["or"] = (f: string) => {
      entry.or = f;
      return q;
    };
    q["select"] = async () => ({ data: [{ id: "row-1" }], error: null });
    q["then"] = (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null });
    return q;
  };
  return { client: { from } as never, updates };
}

const row = {
  id: "row-1",
  school_id: "s1",
  invoice_id: "inv-1",
  method: "GPO",
  merchant_transaction_id: "S123",
  provider_charge_id: "ch-1",
  amount: 100,
  status: "settling",
  reference_number: null,
};

describe("cobrança AppyPay presa em settling", () => {
  it("a reclamação aceita settling parado há mais de 10 minutos", async () => {
    const { client, updates } = db();
    const before = Date.now();
    await reconcileAppyPayCharge(client, row);
    const claim = updates.find((u) => u.values["status"] === "settling");
    expect(claim?.or).toMatch(/status\.in\.\(pending,failed,expired\)/);
    const stale = /and\(status\.eq\.settling,last_webhook_at\.lt\.([^)]+)\)/.exec(claim?.or ?? "");
    expect(stale).not.toBeNull();
    const cutoff = Date.parse(stale![1]!);
    expect(before - cutoff).toBeGreaterThanOrEqual(STALE_SETTLING_MINUTES * 60_000 - 50);
  });

  it("retomar uma já liquidada não apaga o número do recibo", async () => {
    const { client, updates } = db();
    const result = await reconcileAppyPayCharge(client, row);
    expect(result.status).toBe("paid");
    const paid = updates.find((u) => u.values["status"] === "paid");
    expect(paid?.values).not.toHaveProperty("receipt_number");
    expect(settle).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ externalId: "ch-1" }),
    );
  });
});
