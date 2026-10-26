import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
let tables: Record<string, Row[]> = {};

/**
 * Base em memória com o que o `pagedReadClient` usa: filtros, ordem e `range`. Como o
 * servidor, nunca devolve mais de 1000 linhas, e o `limit` corta.
 */
function memoryDb() {
  return {
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      let window: [number, number] = [0, Infinity];
      const rows = () =>
        (tables[table] ?? [])
          .filter((row) => filters.every((f) => f(row)))
          .slice(window[0], Math.min(window[1] + 1, window[0] + 1000));
      const chain = {
        select: () => chain,
        order: () => chain,
        limit: (n: number) => {
          window = [0, n - 1];
          return chain;
        },
        range: (from: number, to: number) => {
          window = [from, to];
          return chain;
        },
        eq: (column: string, value: unknown) => {
          filters.push((row) => row[column] === value);
          return chain;
        },
        neq: (column: string, value: unknown) => {
          filters.push((row) => row[column] !== value);
          return chain;
        },
        lt: (column: string, value: string) => {
          filters.push((row) => row[column] != null && String(row[column]) < value);
          return chain;
        },
        lte: () => chain,
        gte: () => chain,
        in: (column: string, values: unknown[]) => {
          filters.push((row) => values.includes(row[column]));
          return chain;
        },
        maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
        then: (resolve: (value: unknown) => unknown) => resolve({ data: rows(), error: null }),
      };
      return chain;
    },
  };
}

const S = "00000000-0000-0000-0000-00000000000a";

vi.mock("@/integrations/supabase/sga-admin", () => ({
  resolveSgaMembershipAdmin: async () => ({ schoolId: S, appRole: "Tesouraria" }),
}));
vi.mock("@/features/calendar/dates", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/calendar/dates")>()),
  todayInLuanda: () => "2026-10-26",
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = {
      validator: () => fn,
      middleware: () => fn,
      handler:
        (h: (ctx: { data: unknown; context: { userId: string; supabase: unknown } }) => unknown) =>
        () =>
          h({ data: undefined, context: { userId: "u1", supabase: memoryDb() } }),
    };
    return fn;
  },
}));

const { getSchoolTodayOps } = await import("@/features/dashboard/server");

const invoice = (n: number, extra: Row = {}): Row => ({
  id: `inv-${n}`,
  school_id: S,
  amount: 1000,
  discount_amount: 0,
  penalty_amount: 0,
  status: "issued",
  due_date: "2026-10-01",
  ...extra,
});
const receipt = (n: number, extra: Row = {}): Row => ({
  id: `rec-${n}`,
  school_id: S,
  invoice_id: `inv-${n}`,
  amount: 1000,
  status: "issued",
  ...extra,
});

beforeEach(() => {
  tables = {};
});

describe("painel de hoje — faturas em atraso", () => {
  it("uma fatura paga não conta, mesmo com mais de 250 faturas e recibos", async () => {
    tables.finance_invoices = [
      ...Array.from({ length: 300 }, (_, i) => invoice(i)),
      invoice(900, { status: "cancelled" }), // anulada: não conta
      invoice(901, { due_date: "2026-11-30" }), // ainda não venceu
      invoice(902, { due_date: null }), // sem vencimento: não está em atraso
    ];
    tables.finance_receipts = [
      // Pagas todas menos a 299.
      ...Array.from({ length: 299 }, (_, i) => receipt(i)),
      // A 0 tem o recibo anulado: fica por pagar.
      receipt(0, { id: "rec-0-reversed", status: "reversed" }),
    ];
    // O recibo válido da 0 sai: só o anulado fica.
    tables.finance_receipts = tables.finance_receipts.filter((r) => r.id !== "rec-0");

    const ops = await (
      getSchoolTodayOps as unknown as () => Promise<{ overdueInvoices: number }>
    )();
    expect(ops.overdueInvoices).toBe(2);
  });

  it("acima de 1000 faturas vencidas, conta todas", async () => {
    tables.finance_invoices = Array.from({ length: 1200 }, (_, i) => invoice(i));
    tables.finance_receipts = [];
    const ops = await (
      getSchoolTodayOps as unknown as () => Promise<{ overdueInvoices: number }>
    )();
    expect(ops.overdueInvoices).toBe(1200);
  });
});
