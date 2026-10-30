import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildInvoiceDetail, type InvoiceDetailRow } from "@/features/finance/invoice-detail";

/**
 * Página da fatura (contexto financeiro): a fatura da escola activa, o aluno a
 * quem foi emitida e os recibos. Uma fatura não é um recibo: o pago é a soma dos
 * recibos válidos, e um recibo estornado aparece como tal sem contar.
 */

const mocks = vi.hoisted(() => ({
  membership: { schoolId: "school-a", appRole: "Tesouraria", allAppRoles: ["Tesouraria"] },
  guard: vi.fn(),
  tables: {} as Record<string, { data: unknown; error: unknown }>,
  filters: [] as Array<[string, string, unknown]>,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      middleware: () => builder,
      validator: () => builder,
      handler: (fn: unknown) => fn,
    };
    return builder;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/features/people/lookup", () => ({
  loadPersonNamesById: async () => new Map([["pessoa-ana", "Ana Paula Silva"]]),
}));
vi.mock("@/features/finance/late-fee", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  todayIso: () => "2026-10-26",
}));
vi.mock("@/integrations/supabase/sga-admin", () => ({
  resolveSgaMembershipAdmin: async () => mocks.membership,
  requireSgaWriterFor: async (...args: unknown[]) => {
    mocks.guard(...args);
    return mocks.membership;
  },
  requireSgaWriterForWrite: async () => mocks.membership,
  loadSgaAdminClient: async () => ({
    from: (table: string) => {
      const result = () => mocks.tables[table] ?? { data: [], error: null };
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          mocks.filters.push([table, column, value]);
          return query;
        },
        in: (column: string, value: unknown) => {
          mocks.filters.push([table, column, value]);
          return query;
        },
        order: () => query,
        limit: () => query,
        maybeSingle: async () => {
          const { data, error } = result();
          return { data: Array.isArray(data) ? (data[0] ?? null) : data, error };
        },
        then: (resolve: (value: unknown) => unknown) => resolve(result()),
      };
      return query;
    },
  }),
}));

import { getInvoiceDetail } from "@/features/finance/server";

type Handler = (args: {
  data: Record<string, unknown>;
  context: { userId: string; supabase: unknown };
}) => Promise<Awaited<ReturnType<typeof getInvoiceDetail>>>;
const run = (invoiceId: string) =>
  (getInvoiceDetail as unknown as Handler)({
    data: { invoiceId },
    context: { userId: "user-a", supabase: {} },
  });

const FATURA = "33333333-3333-4333-8333-333333333333";
const ALUNO = "22222222-2222-4222-8222-222222222222";

const invoiceRow = (over: Partial<InvoiceDetailRow> = {}): InvoiceDetailRow => ({
  id: FATURA,
  invoice_number: "FT-2026/0311",
  competence_month: "2026-10",
  amount: 50_000,
  discount_amount: 5_000,
  penalty_amount: 0,
  due_date: "2026-10-10",
  status: "open",
  created_at: "2026-10-01T08:00:00Z",
  cancellation_reason: null,
  ...over,
});

const receipt = (id: string, amount: number, paid_on: string, status = "issued") => ({
  id,
  receipt_number: `RC-${id}`,
  amount,
  paid_on,
  payment_method: "cash",
  status,
  reversal_reason: status === "reversed" ? "Valor errado" : null,
});

describe("buildInvoiceDetail", () => {
  it("o pago é a soma dos recibos válidos; um estornado aparece sem contar", () => {
    const detail = buildInvoiceDetail({
      schoolId: "school-a",
      invoice: invoiceRow(),
      receipts: [
        receipt("2", 10_000, "2026-10-20"),
        receipt("1", 20_000, "2026-10-05", "reversed"),
      ],
      student: null,
      feeName: "Propina",
      today: "2026-10-26",
    });
    expect(detail).toMatchObject({
      number: "FT-2026/0311",
      description: "Propina",
      total: 45_000,
      paid: 10_000,
      openAmount: 35_000,
      issuedOn: "2026-10-01",
      state: { status: "overdue", label: "Vencida · paga em parte" },
    });
    // Do pagamento mais antigo para o mais recente, cada um com o seu estado.
    expect(detail.receipts.map((r) => [r.number, r.state.label])).toEqual([
      ["RC-1", "Estornado"],
      ["RC-2", "Confirmado"],
    ]);
  });

  it("uma fatura anulada não tem valor por pagar", () => {
    const detail = buildInvoiceDetail({
      schoolId: "school-a",
      invoice: invoiceRow({ status: "cancelled", cancellation_reason: "Emitida em duplicado" }),
      receipts: [],
      student: null,
      feeName: null,
      today: "2026-10-26",
    });
    expect(detail).toMatchObject({
      description: "Fatura escolar",
      openAmount: 0,
      state: { status: "cancelled", label: "Anulada" },
      cancellationReason: "Emitida em duplicado",
    });
  });
});

describe("getInvoiceDetail", () => {
  beforeEach(() => {
    mocks.guard.mockClear();
    mocks.filters = [];
    mocks.tables = {
      finance_invoices: {
        data: { ...invoiceRow(), contract_id: "contrato-1", fee_item_id: "fee-1" },
        error: null,
      },
      finance_contracts: { data: { id: "contrato-1", enrollment_id: "matricula-1" }, error: null },
      fee_items: { data: { id: "fee-1", name: "Propina de Outubro" }, error: null },
      finance_receipts: { data: [receipt("1", 45_000, "2026-10-08")], error: null },
      enrollments: { data: { id: "matricula-1", student_id: ALUNO }, error: null },
      students: {
        data: [
          { id: ALUNO, student_number: "2026-0142", person_id: "pessoa-ana", status: "active" },
        ],
        error: null,
      },
    };
  });

  it("lê a fatura da escola activa, com o aluno e os recibos", async () => {
    const detail = await run(FATURA);
    expect(mocks.guard).toHaveBeenCalledWith("financeiro", {}, "user-a", [
      "Administrador",
      "Tesouraria",
      "Secretaria",
    ]);
    expect(mocks.filters).toEqual(
      expect.arrayContaining([
        ["finance_invoices", "id", FATURA],
        ["finance_invoices", "school_id", "school-a"],
        ["finance_contracts", "school_id", "school-a"],
        ["finance_receipts", "school_id", "school-a"],
        ["enrollments", "school_id", "school-a"],
      ]),
    );
    expect(detail).toMatchObject({
      schoolId: "school-a",
      description: "Propina de Outubro",
      state: { status: "paid", label: "Paga" },
      student: { id: ALUNO, name: "Ana Paula Silva", registrationNumber: "2026-0142" },
    });
    expect(detail?.receipts).toHaveLength(1);
  });

  it("uma fatura que a escola activa não tem devolve null", async () => {
    mocks.tables.finance_invoices = { data: null, error: null };
    expect(await run(FATURA)).toBeNull();
  });

  it("sem contrato, a fatura abre sem aluno", async () => {
    mocks.tables.finance_invoices = {
      data: { ...invoiceRow(), contract_id: null, fee_item_id: null },
      error: null,
    };
    const detail = await run(FATURA);
    expect(detail?.student).toBeNull();
  });

  it("a tesouraria vê as cobranças electrónicas da fatura, com o estado e a mensagem", async () => {
    mocks.tables.payment_gateway_charges = {
      data: [
        {
          id: "c1",
          method: "REF",
          amount: 25_000,
          reference_entity: "01055",
          reference_number: "123456789",
          status: "pending",
          status_message: "Referência gerada",
          receipt_number: null,
          created_at: "2026-10-20T09:00:00Z",
        },
      ],
      error: null,
    };
    const detail = await run(FATURA);
    expect(mocks.filters).toEqual(
      expect.arrayContaining([
        ["payment_gateway_charges", "school_id", "school-a"],
        ["payment_gateway_charges", "invoice_id", FATURA],
      ]),
    );
    expect(detail?.charges).toEqual([
      {
        id: "c1",
        method: "Referência Multicaixa",
        amount: 25_000,
        reference: "01055 / 123456789",
        state: { status: "pending", label: "A aguardar confirmação" },
        message: "Referência gerada",
        receiptNumber: null,
        createdAt: "2026-10-20T09:00:00Z",
      },
    ]);
  });

  it("a secretaria lê a fatura sem as cobranças, que são da tesouraria", async () => {
    mocks.membership = { schoolId: "school-a", appRole: "Secretaria", allAppRoles: ["Secretaria"] };
    try {
      const detail = await run(FATURA);
      expect(detail?.charges).toBeNull();
      expect(mocks.filters.some(([table]) => table === "payment_gateway_charges")).toBe(false);
    } finally {
      mocks.membership = {
        schoolId: "school-a",
        appRole: "Tesouraria",
        allAppRoles: ["Tesouraria"],
      };
    }
  });
});
