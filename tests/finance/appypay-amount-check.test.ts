import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * §7 do plano financeiro: verificar montante e moeda. Um sucesso da AppyPay sem valor
 * (que `normalize` transforma em 0) creditava a cobrança inteira; noutra moeda, idem.
 */
const remote = {
  id: "ch-1",
  merchantTransactionId: "S123",
  amount: 100,
  status: "Success",
  successful: true,
  message: null,
  raw: {} as Record<string, unknown>,
};
vi.mock("@/lib/appypay.server", () => ({ getAppyPayCharge: async () => remote }));
const settle = vi.fn(async () => ({
  alreadyPaid: false as const,
  receiptId: "r1",
  receiptNumber: "RC-1",
  invoiceStatus: "paid",
  planSettled: false,
}));
vi.mock("@/features/finance/gateway-webhook-handler", () => ({ settleGatewayPayment: settle }));

const { reconcileAppyPayCharge } = await import("@/features/finance/appypay-reconcile.server");

function db() {
  const updates: Array<Record<string, unknown>> = [];
  const from = () => {
    const q: Record<string, unknown> = {};
    q["update"] = (values: Record<string, unknown>) => {
      updates.push(values);
      return q;
    };
    for (const k of ["eq", "neq", "in", "or"]) q[k] = () => q;
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
  method: "REF",
  merchant_transaction_id: "S123",
  provider_charge_id: "ch-1",
  amount: 100,
  status: "pending",
  reference_number: null,
};

beforeEach(() => {
  settle.mockClear();
  remote.amount = 100;
  remote.raw = {};
});

describe("AppyPay: só se lança o valor confirmado em kwanzas", () => {
  it("sucesso sem valor fica em revisão e não lança nada", async () => {
    remote.amount = 0;
    const { client, updates } = db();
    expect((await reconcileAppyPayCharge(client, row)).status).toBe("needs_review");
    expect(settle).not.toHaveBeenCalled();
    expect(updates[0]?.["status"]).toBe("needs_review");
  });

  it("sucesso noutra moeda fica em revisão", async () => {
    remote.raw = { currency: "USD" };
    const { client } = db();
    expect((await reconcileAppyPayCharge(client, row)).status).toBe("needs_review");
    expect(settle).not.toHaveBeenCalled();
  });

  it("valor menor do que a cobrança lança só o que entrou", async () => {
    remote.amount = 60;
    const { client } = db();
    await reconcileAppyPayCharge(client, row);
    expect(settle).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ amount: 60 }));
  });
});
