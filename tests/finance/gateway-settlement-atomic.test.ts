import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { settleGatewayPayment } from "@/features/finance/gateway-webhook-handler";

const SCHOOL = "11111111-1111-4111-8111-111111111111";
const INVOICE = "22222222-2222-4222-8222-222222222222";

/** Base mínima: a fatura existe e está em aberto; tudo o resto devolve vazio. */
function fakeDb(rpcResult: { data: unknown; error: unknown }) {
  const inserts: string[] = [];
  const rpc = vi.fn(async (name: string) => {
    if (name === "register_payment") {
      return { data: null, error: { code: "42501", message: "Sem autorização" } };
    }
    return rpcResult;
  });
  const chain = (table: string): Record<string, unknown> => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "neq", "limit", "update", "order"]) q[m] = () => q;
    q["insert"] = () => {
      inserts.push(table);
      return q;
    };
    q["maybeSingle"] = async () => ({
      data:
        table === "finance_invoices"
          ? { id: INVOICE, status: "open", amount: 100, discount_amount: 0, issued_by: "u1" }
          : null,
      error: null,
    });
    q["then"] = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
    return q;
  };
  return { db: { rpc, from: chain } as unknown as SupabaseClient, rpc, inserts };
}

const input = {
  schoolId: SCHOOL,
  invoiceId: INVOICE,
  amount: 40,
  method: "multicaixa_express",
  reference: "123456789",
  externalId: "emis-000123",
};

describe("liquidação atómica do gateway", () => {
  it("usa a função da base e não escreve recibos pelo caminho em passos", async () => {
    const { db, rpc, inserts } = fakeDb({
      data: {
        alreadyPaid: false,
        receiptId: "r1",
        receiptNumber: "REC-0007",
        invoiceStatus: "partially_paid",
      },
      error: null,
    });
    const result = await settleGatewayPayment(db, input);
    expect(result).toMatchObject({ alreadyPaid: false, receiptNumber: "REC-0007" });
    expect(rpc).toHaveBeenCalledWith(
      "settle_gateway_payment_service",
      expect.objectContaining({ external_id: "emis-000123", received_by: "u1" }),
    );
    expect(inserts).not.toContain("finance_receipts");
  });

  it("reenvio da mesma transacção devolve já liquidado", async () => {
    const { db } = fakeDb({ data: { alreadyPaid: true }, error: null });
    expect(await settleGatewayPayment(db, input)).toMatchObject({ alreadyPaid: true });
  });

  it("um erro da função (ex.: saldo excedido) não cai no caminho em passos", async () => {
    const { db, inserts } = fakeDb({
      data: null,
      error: { code: "22023", message: "O valor do pagamento excede o saldo em aberto da fatura." },
    });
    await expect(settleGatewayPayment(db, input)).rejects.toThrow(/excede o saldo/);
    expect(inserts).not.toContain("finance_receipts");
  });
});
