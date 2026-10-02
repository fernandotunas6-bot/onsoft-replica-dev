import { describe, expect, it, vi } from "vitest";

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
    expect(payflowSettlementInputSchema.safeParse({ ...paid, currency: "USD" }).success).toBe(
      false,
    );
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

type Row = Record<string, unknown>;

/** Base falsa: filtros `eq` e `update`/`select`, com as regras de `finance_invoices`. */
function fakeDb(tables: Record<string, Row[]>) {
  const writes: Array<{ table: string; values: Row; filters: Row }> = [];
  const INVOICE_STATUSES = ["open", "partially_paid", "paid", "cancelled"];
  const from = (table: string) => {
    const filters: Row = {};
    let pending: Row | null = null;
    const rows = () =>
      (tables[table] ?? []).filter((row) =>
        Object.entries(filters).every(([key, value]) => row[key] === value),
      );
    const run = () => {
      if (!pending) return { data: rows(), error: null };
      if (table === "finance_invoices") {
        if ("updated_at" in pending) return { data: null, error: { message: "no updated_at" } };
        if (!INVOICE_STATUSES.includes(String(pending["status"]))) {
          return { data: null, error: { message: "violates check constraint" } };
        }
      }
      writes.push({ table, values: pending, filters: { ...filters } });
      for (const row of rows()) Object.assign(row, pending);
      return { data: null, error: null };
    };
    const builder = {
      select: () => builder,
      update: (values: Row) => {
        pending = values;
        return builder;
      },
      eq: (key: string, value: unknown) => {
        filters[key] = value;
        return builder;
      },
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (resolve: (value: ReturnType<typeof run>) => unknown) => resolve(run()),
    };
    return builder;
  };
  return { db: { from }, writes };
}

const current: { db: unknown } = { db: null };
vi.mock("@/integrations/supabase/sga-admin", () => ({
  loadSgaAdminClient: async () => current.db,
}));

describe("estorno PayFlow", () => {
  const school = "22222222-2222-4222-8222-222222222222";
  const invoiceId = "33333333-3333-4333-8333-333333333333";
  const refund = {
    event: "payment.refunded" as const,
    school_id: school,
    invoice_id: invoiceId,
    payment_id: "pay_refund_1",
    amount_minor: 1_500_000,
    currency: "AOA",
  };

  it("anula os recibos e reabre a fatura paga como 'open', sem colunas inexistentes", async () => {
    const { db, writes } = fakeDb({
      finance_invoices: [
        { id: invoiceId, school_id: school, status: "paid", amount: 15000, discount_amount: 0 },
      ],
      finance_receipts: [
        { id: "r1", invoice_id: invoiceId, school_id: school, status: "issued", amount: 15000 },
      ],
    });
    current.db = db;
    const { applyPayflowSettlement } = await import("@/features/finance/payflow-settlement");
    const result = await applyPayflowSettlement(refund);
    expect(result).toMatchObject({ ok: true, idempotent: false });
    expect(writes.map((w) => [w.table, w.values["status"]])).toEqual([
      ["finance_receipts", "reversed"],
      ["finance_invoices", "open"],
    ]);
    expect(writes[1]!.filters).toMatchObject({ status: "paid" });
  });

  it("fatura parcialmente paga também volta a 'open' quando todos os recibos são anulados", async () => {
    const { db, writes } = fakeDb({
      finance_invoices: [
        {
          id: invoiceId,
          school_id: school,
          status: "partially_paid",
          amount: 20000,
          discount_amount: 0,
        },
      ],
      finance_receipts: [
        { id: "r1", invoice_id: invoiceId, school_id: school, status: "issued", amount: 5000 },
      ],
    });
    current.db = db;
    const { applyPayflowSettlement } = await import("@/features/finance/payflow-settlement");
    expect(await applyPayflowSettlement(refund)).toMatchObject({ ok: true });
    expect(writes.at(-1)).toMatchObject({ table: "finance_invoices", values: { status: "open" } });
  });

  it("fatura anulada não muda de estado", async () => {
    const { db, writes } = fakeDb({
      finance_invoices: [
        {
          id: invoiceId,
          school_id: school,
          status: "cancelled",
          amount: 15000,
          discount_amount: 0,
        },
      ],
      finance_receipts: [
        { id: "r1", invoice_id: invoiceId, school_id: school, status: "issued", amount: 15000 },
      ],
    });
    current.db = db;
    const { applyPayflowSettlement } = await import("@/features/finance/payflow-settlement");
    expect(await applyPayflowSettlement(refund)).toMatchObject({ ok: true });
    expect(writes.map((w) => w.table)).toEqual(["finance_receipts"]);
  });
});
