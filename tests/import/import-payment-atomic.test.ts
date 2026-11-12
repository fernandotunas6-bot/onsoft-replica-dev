import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  importPaymentKey,
  loadExistingReceiptNumbers,
  registerReceiptDirect,
} from "@/features/import/importers/finance-core";
import { fakePostgrest } from "../helpers/fake-postgrest";

/**
 * Importação de pagamentos (§4.3 e §11 do plano financeiro): era um segundo caminho de
 * pagamento, em passos soltos, sem trancar a fatura nem contar a multa, e a mesma folha
 * importada outra vez sem nº de recibo voltava a pagar. Passa pela liquidação atómica dos
 * webhooks, com uma chave por linha no `external_id`.
 */

type Rpc = { data: unknown; error: { code?: string; message?: string } | null };

/** Cliente com `rpc` e o caminho em passos (soma, insert, update), que regista as escritas. */
function client(rpc: Rpc) {
  const writes: Array<{ table: string; op: string; values?: unknown }> = [];
  const chain = (table: string, result: unknown) => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order", "range"]) q[m] = () => q;
    q["single"] = () => Promise.resolve(result);
    q["then"] = (resolve: (v: unknown) => void) => resolve(result);
    q["insert"] = (values: unknown) => {
      writes.push({ table, op: "insert", values });
      return chain(table, { data: { id: "recibo-novo" }, error: null });
    };
    q["update"] = (values: unknown) => {
      writes.push({ table, op: "update", values });
      return chain(table, { data: null, error: null });
    };
    return q;
  };
  const db = {
    rpc: vi.fn(async () => rpc),
    from: (table: string) => chain(table, { data: [], error: null }),
  };
  return { db: db as unknown as SupabaseClient, rpc: db.rpc, writes };
}

const params = {
  schoolId: "escola",
  invoiceId: "fatura",
  invoiceAmount: 10000,
  amount: 4000,
  paymentMethod: "bank_transfer" as const,
  paidOn: "2026-10-20",
  receivedBy: "operador",
  receiptNumberHint: null,
  importKey: "fatura:4000.00:2026-10-20:bank_transfer",
};

describe("registerReceiptDirect", () => {
  it("liquida pela função atómica, com a chave da linha no external_id", async () => {
    const { db, rpc, writes } = client({
      data: {
        alreadyPaid: false,
        receiptId: "r1",
        receiptNumber: "REC-0001",
        invoiceStatus: "partially_paid",
      },
      error: null,
    });
    const r = await registerReceiptDirect(db, params);
    expect(rpc).toHaveBeenCalledWith("settle_gateway_payment_service", {
      school_id: "escola",
      invoice_id: "fatura",
      amount: 4000,
      payment_method: "bank_transfer",
      received_by: "operador",
      external_id: "import:fatura:4000.00:2026-10-20:bank_transfer",
      paid_on: "2026-10-20",
    });
    expect(r).toEqual({
      receiptId: "r1",
      receiptNumber: "REC-0001",
      invoiceStatus: "partially_paid",
      alreadyImported: false,
    });
    expect(writes).toEqual([]);
  });

  it("a mesma linha outra vez devolve o recibo existente, sem emitir outro", async () => {
    const { db, writes } = client({
      data: {
        alreadyPaid: true,
        receiptId: "r1",
        receiptNumber: "REC-0001",
        invoiceStatus: "paid",
      },
      error: null,
    });
    const r = await registerReceiptDirect(db, params);
    expect(r.alreadyImported).toBe(true);
    expect(r.receiptNumber).toBe("REC-0001");
    expect(writes).toEqual([]);
  });

  it("fatura já paga por outro caminho: recusa a linha", async () => {
    const { db } = client({ data: { alreadyPaid: true, invoiceStatus: "paid" }, error: null });
    await expect(registerReceiptDirect(db, params)).rejects.toThrow(/já está paga/);
  });

  it("um erro da função (saldo excedido) passa à linha, sem cair no caminho em passos", async () => {
    const { db, writes } = client({
      data: null,
      error: { code: "22023", message: "O valor do pagamento excede o saldo em aberto da fatura." },
    });
    await expect(registerReceiptDirect(db, params)).rejects.toThrow(/excede o saldo/);
    expect(writes).toEqual([]);
  });

  it("só sem a função na base segue o caminho em passos", async () => {
    const { db, writes } = client({
      data: null,
      error: { code: "PGRST202", message: "Could not find the function" },
    });
    const r = await registerReceiptDirect(db, params);
    expect(r.receiptId).toBe("recibo-novo");
    expect(writes.map((w) => `${w.table}.${w.op}`)).toEqual([
      "finance_receipts.insert",
      "finance_invoices.update",
    ]);
  });
});

describe("importPaymentKey", () => {
  it("com nº de recibo na folha, a chave é ele", () => {
    expect(
      importPaymentKey({
        receiptNumberHint: " RC-77 ",
        invoiceId: "f",
        amount: 1,
        paidOn: "2026-10-01",
        paymentMethod: "cash",
      }),
    ).toBe("recibo:RC-77");
  });

  it("sem ele, fatura, valor, data e método: a mesma linha dá a mesma chave", () => {
    const linha = { invoiceId: "f", amount: 4000, paidOn: "2026-10-20", paymentMethod: "cash" };
    expect(importPaymentKey(linha)).toBe(importPaymentKey({ ...linha, receiptNumberHint: "" }));
    expect(importPaymentKey(linha)).toBe("f:4000.00:2026-10-20:cash");
    expect(importPaymentKey({ ...linha, amount: 4000.5 })).not.toBe(importPaymentKey(linha));
    expect(importPaymentKey({ ...linha, paidOn: "2026-10-21" })).not.toBe(importPaymentKey(linha));
  });
});

describe("loadExistingReceiptNumbers", () => {
  it("reconhece o nº da folha de uma importação anterior, guardado no external_id", async () => {
    const db = fakePostgrest({
      finance_receipts: [
        { id: "1", school_id: "s", receipt_number: "REC-0001", external_id: "import:recibo:RC-77" },
        { id: "2", school_id: "s", receipt_number: "RC-10", external_id: null },
        { id: "3", school_id: "s", receipt_number: "REC-0002", external_id: "appypay:abc" },
      ],
    }).client as unknown as SupabaseClient;
    const numbers = await loadExistingReceiptNumbers(db, "s");
    expect([...numbers].sort()).toEqual(["RC-10", "RC-77", "REC-0001", "REC-0002"]);
  });
});
