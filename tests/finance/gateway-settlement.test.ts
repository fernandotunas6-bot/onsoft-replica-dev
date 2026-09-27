import { describe, expect, it } from "vitest";
import { settleGatewayPayment } from "@/features/finance/gateway-webhook-handler";

type Row = Record<string, unknown>;

/** Base simulada: respostas por tabela; regista as escritas. */
function fakeDb(tables: { invoice: Row; receipts?: Row[]; memberships?: Row[] }) {
  const writes: Array<{ table: string; op: string; payload: unknown; filters: Row }> = [];
  const builder = (table: string) => {
    const state: { op: string; payload?: unknown; filters: Row } = { op: "select", filters: {} };
    const result = () => {
      if (state.op !== "select") {
        writes.push({ table, op: state.op, payload: state.payload, filters: { ...state.filters } });
        if (table === "finance_receipts" && state.op === "insert")
          return { data: { id: "rec-1" }, error: null };
        return { data: [], error: null };
      }
      if (table === "finance_invoices") return { data: tables.invoice, error: null };
      if (table === "finance_receipts")
        return { data: tables.receipts ?? [], error: null, count: 0 };
      if (table === "school_memberships") {
        const rows = (tables.memberships ?? []).filter(
          (m) => !state.filters["school_id"] || m["school_id"] === state.filters["school_id"],
        );
        return { data: rows[0] ?? null, error: null };
      }
      return { data: [], error: null };
    };
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "like", "limit", "order", "not"]) {
      chain[m] = (col: unknown, val: unknown) => {
        if (m === "eq" && typeof col === "string") state.filters[col] = val;
        return chain;
      };
    }
    chain["insert"] = (payload: unknown) => (
      (state.op = "insert"),
      (state.payload = payload),
      chain
    );
    chain["update"] = (payload: unknown) => (
      (state.op = "update"),
      (state.payload = payload),
      chain
    );
    chain["maybeSingle"] = async () => result();
    chain["single"] = async () => result();
    chain["then"] = (resolve: (v: unknown) => unknown) => resolve(result());
    return chain;
  };
  const db = {
    from: builder,
    // Webhook sem sessão AAL2: a função oficial recusa e entra a liquidação directa.
    rpc: async () => ({ data: null, error: { message: "requires aal2", code: "42501" } }),
  };
  return { db: db as never, writes };
}

const base = { schoolId: "s1", invoiceId: "i1", method: "multicaixa", reference: "REF1" };

describe("liquidação de pagamentos por webhook (sem sessão)", () => {
  it("recusa um pagamento acima do saldo em aberto, sem emitir recibo", async () => {
    const { db, writes } = fakeDb({
      invoice: {
        id: "i1",
        status: "partially_paid",
        amount: 10000,
        discount_amount: 0,
        issued_by: "u1",
      },
      receipts: [{ amount: 6000 }],
    });
    await expect(settleGatewayPayment(db, { ...base, amount: 5000 })).rejects.toThrow(
      /excede o saldo em aberto/,
    );
    expect(writes.filter((w) => w.table === "finance_receipts")).toEqual([]);
  });

  it("sem responsável na escola, não usa ninguém de outra escola", async () => {
    const { db, writes } = fakeDb({
      invoice: { id: "i1", status: "open", amount: 10000, discount_amount: 0, issued_by: null },
      memberships: [{ school_id: "outra-escola", user_id: "intruso" }],
    });
    await expect(settleGatewayPayment(db, { ...base, amount: 10000 })).rejects.toThrow(
      /responsável nesta escola/,
    );
    expect(writes.some((w) => JSON.stringify(w.payload).includes("intruso"))).toBe(false);
  });

  it("pagamento dentro do saldo: emite o recibo e marca a fatura como paga", async () => {
    const { db, writes } = fakeDb({
      invoice: {
        id: "i1",
        status: "partially_paid",
        amount: 10000,
        discount_amount: 0,
        issued_by: "u1",
      },
      receipts: [{ amount: 6000 }],
    });
    const result = await settleGatewayPayment(db, { ...base, amount: 4000 });
    expect(result.receiptNumber).toMatch(/^REC-\d{4}\/\d{4}$/);
    const receipt = writes.find((w) => w.table === "finance_receipts" && w.op === "insert");
    expect(receipt?.payload).toMatchObject({ amount: 4000, received_by: "u1", school_id: "s1" });
    const invoice = writes.find((w) => w.table === "finance_invoices" && w.op === "update");
    expect(invoice?.payload).toEqual({ status: "paid" });
  });
});
