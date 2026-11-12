import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  denied: false,
  rpc: vi.fn(),
  report: vi.fn(),
  receiptsError: false,
  planError: false,
  receipts: [] as Record<string, unknown>[],
  updates: [] as Array<{ table: string; filters: Array<[string, unknown]> }>,
}));
vi.mock("@tanstack/react-start", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-start")>();
  return {
    ...actual,
    createServerFn: () => {
      let validate: ((data: unknown) => unknown) | undefined;
      const builder = {
        middleware: () => builder,
        validator: (fn: (data: unknown) => unknown) => {
          validate = fn;
          return builder;
        },
        inputValidator: (fn: (data: unknown) => unknown) => {
          validate = fn;
          return builder;
        },
        handler: (fn: (args: unknown) => unknown) => (input: { data: unknown }) =>
          fn({
            data: validate ? validate(input?.data) : input?.data,
            context: { userId: "user-A", supabase: { rpc: state.rpc } },
          }),
      };
      return builder;
    },
  };
});
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/features/school/settings-domains", () => ({ readSettingsDomain: async () => ({}) }));
vi.mock("@/lib/ops-report", () => ({ reportSigaError: state.report }));
vi.mock("@/integrations/supabase/server-error", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/integrations/supabase/server-error")>()),
  publicDatabaseError: (_error: unknown, message: string) => new Error(message),
}));
vi.mock("@/features/finance/emiss-multicaixa", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/finance/emiss-multicaixa")>()),
  resolveConfiguredSchoolEmisEntity: async () => "12345",
}));
vi.mock("@/integrations/supabase/sga-admin", () => {
  const membership = async () => {
    if (state.denied) throw new Error("Sem permissão");
    return { schoolId: "school-A", appRole: "Tesouraria" };
  };
  return {
    requireSgaWriterFor: membership,
    requireSgaWriterForWrite: membership,
    loadSgaAdminClient: async () => ({
      from: (table: string) => {
        const filters: Array<[string, unknown]> = [];
        let from = 0;
        let to = 999;
        let updating = false;
        const builder = {
          select: () => builder,
          order: () => builder,
          eq: (field: string, value: unknown) => {
            filters.push([field, value]);
            return builder;
          },
          in: () => builder,
          range: (start: number, end: number) => {
            from = start;
            to = end;
            return builder;
          },
          update: () => {
            updating = true;
            return builder;
          },
          maybeSingle: async () => ({
            data: {
              id: invoiceId,
              school_id: "school-A",
              amount: 25000,
              discount_amount: 0,
              penalty_amount: 0,
              status: "open",
              due_date: "2099-12-31",
            },
            error: null,
          }),
          then: (resolve: (value: unknown) => unknown) => {
            if (updating) state.updates.push({ table, filters });
            const error =
              (table === "finance_receipts" && state.receiptsError) ||
              (table === "finance_payment_plans" && state.planError)
                ? { message: "Falha controlada" }
                : null;
            const rows =
              table === "finance_receipts"
                ? state.receipts
                    .filter((r) => filters.every(([k, v]) => r[k] === v))
                    .slice(from, to + 1)
                : [];
            return Promise.resolve({ data: error ? null : rows, error }).then(resolve);
          },
        };
        return builder;
      },
    }),
  };
});
import {
  recordInvoicePayment,
  confirmManualMulticaixaPayment,
  generateInvoicePaymentReference,
} from "@/features/finance/server";
const invoiceId = "3f6b1c2e-6a1d-4c0b-9b51-0d6f3c8e2a11";
const key = "4f6b1c2e-6a1d-4c0b-9b51-0d6f3c8e2a11";
const manual = { invoiceId, amount: 10000, reference: "111 222 333", idempotencyKey: key };
beforeEach(() => {
  state.denied = false;
  state.report.mockReset();
  state.receiptsError = false;
  state.planError = false;
  state.receipts = [];
  state.updates = [];
  state.rpc.mockReset().mockResolvedValue({
    data: {
      receiptId: "receipt-A",
      receiptNumber: "RC-1",
      invoiceStatus: "paid",
      replayed: true,
    },
    error: null,
  });
});
describe("integridade da confirmação manual — servidor simulado", () => {
  it("encaminha a chave e não liquida planos num pagamento parcial", async () => {
    state.rpc.mockResolvedValue({
      data: {
        receiptId: "r",
        receiptNumber: "RC-1",
        invoiceStatus: "partially_paid",
        replayed: true,
      },
      error: null,
    });
    const result = await confirmManualMulticaixaPayment({ data: manual });
    expect(state.rpc).toHaveBeenCalledWith(
      "register_payment",
      expect.objectContaining({ invoice_id: invoiceId, idempotency_key: key }),
    );
    expect(result.invoiceStatus).toBe("partially_paid");
    expect(state.updates).toEqual([]);
  });
  it("factura liquidada só acerta planos da mesma escola e factura", async () => {
    await confirmManualMulticaixaPayment({ data: manual });
    expect(state.updates).toEqual([
      {
        table: "finance_payment_plans",
        filters: [
          ["school_id", "school-A"],
          ["invoice_id", invoiceId],
        ],
      },
    ]);
  });
  it("uma RPC sem suporte à chave não tenta escrever novamente sem ela", async () => {
    state.rpc.mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "Missing overload" },
    });
    await expect(
      recordInvoicePayment({
        data: { invoiceId, amount: 10000, method: "cash", idempotencyKey: key },
      }),
    ).rejects.toThrow("confirmação segura");
    expect(state.rpc).toHaveBeenCalledTimes(1);
  });
  it("falhar o acerto dos planos não transforma o recibo aceite em falha de pagamento", async () => {
    state.planError = true;
    const result = await confirmManualMulticaixaPayment({ data: manual });
    expect(result.receiptNumber).toBe("RC-1");
    expect(result.success).toBe(true);
    expect(state.report).toHaveBeenCalledWith(
      "finance.payment_plan.settle_failed",
      expect.anything(),
      { school_id: "school-A", invoice_id: invoiceId },
    );
    expect(state.rpc).toHaveBeenCalledTimes(1);
  });
  it("repetir a tentativa preserva a chave e devolve o recibo existente", async () => {
    state.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "503", message: "Falha de rede" },
    });
    const data = { invoiceId, amount: 10000, method: "cash" as const, idempotencyKey: key };
    await expect(recordInvoicePayment({ data })).rejects.toThrow();
    const replay = await recordInvoicePayment({ data });
    expect(replay.receipt_number).toBe("RC-1");
    expect(state.rpc.mock.calls.map((call) => call[1].idempotency_key)).toEqual([key, key]);
  });
  it("sem permissão não chega à RPC", async () => {
    state.denied = true;
    await expect(confirmManualMulticaixaPayment({ data: manual })).rejects.toThrow("Sem permissão");
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it("erro na leitura dos recibos impede gerar uma referência com dívida excessiva", async () => {
    state.receiptsError = true;
    await expect(generateInvoicePaymentReference({ data: { invoiceId } })).rejects.toThrow(
      "conferir os pagamentos",
    );
  });
  it("soma recibos além de 1000 linhas, sem contar estornos nem outra escola/factura", async () => {
    state.receipts = Array.from({ length: 1200 }, (_, i) => ({
      id: `r${i}`,
      school_id: "school-A",
      invoice_id: invoiceId,
      status: "issued",
      amount: 10,
    }));
    state.receipts.push(
      {
        id: "reversed",
        school_id: "school-A",
        invoice_id: invoiceId,
        status: "reversed",
        amount: 5000,
      },
      {
        id: "other-school",
        school_id: "school-B",
        invoice_id: invoiceId,
        status: "issued",
        amount: 5000,
      },
      {
        id: "other-invoice",
        school_id: "school-A",
        invoice_id: "other",
        status: "issued",
        amount: 5000,
      },
    );
    const result = await generateInvoicePaymentReference({ data: { invoiceId } });
    expect(result.multicaixa.amountNumber).toBe(13000);
  });
});
