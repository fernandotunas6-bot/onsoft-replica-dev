import { describe, expect, it, vi } from "vitest";
import {
  loadCompleteInvoiceReceipts,
  receiptsPaidByInvoice,
  type InvoiceReceiptRow,
} from "@/features/finance/invoice-receipts";

function receipt(id: number, invoiceId = "invoice-a"): InvoiceReceiptRow {
  return { id: `receipt-${String(id).padStart(5, "0")}`, invoice_id: invoiceId, amount: 0.1, status: "issued" };
}

describe("listagem financeira — recibos completos por fatura", () => {
  it("carrega mais de 1000 recibos sem omitir pagamentos antigos", async () => {
    const rows = Array.from({ length: 1205 }, (_, i) => receipt(i));
    const read = vi.fn(async (_ids: string[], from: number, to: number) => ({
      data: rows.slice(from, to + 1),
      error: null,
    }));
    const result = await loadCompleteInvoiceReceipts(["invoice-a"], read);
    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(1205);
    expect(read).toHaveBeenCalledTimes(2);
    expect(receiptsPaidByInvoice(result.data).get("invoice-a")).toBe(120.5);
  });

  it("divide IDs em lotes, remove duplicações e mantém a paginação por lote", async () => {
    const calls: Array<{ ids: string[]; from: number; to: number }> = [];
    const result = await loadCompleteInvoiceReceipts(
      ["invoice-a", "invoice-b", "invoice-a", "invoice-c"],
      async (ids, from, to) => {
        calls.push({ ids, from, to });
        return {
          data: ids.map((id, index) => receipt(index, id)),
          error: null,
        };
      },
      { idsPerQuery: 2, rowsPerPage: 5 },
    );
    expect(result.data.map((row) => row.invoice_id)).toEqual([
      "invoice-a",
      "invoice-b",
      "invoice-c",
    ]);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual({ ids: ["invoice-a", "invoice-b"], from: 0, to: 4 });
    expect(calls[1]).toEqual({ ids: ["invoice-c"], from: 0, to: 4 });
  });

  it("sem faturas não consulta a base", async () => {
    const read = vi.fn(async () => ({ data: [], error: null }));
    expect(await loadCompleteInvoiceReceipts([], read)).toEqual({ data: [], error: null });
    expect(read).not.toHaveBeenCalled();
  });

  it("não devolve um saldo parcial quando qualquer página falha", async () => {
    const result = await loadCompleteInvoiceReceipts(
      ["invoice-a"],
      async (_ids, from) =>
        from === 0
          ? { data: [receipt(1), receipt(2)], error: null }
          : { data: null, error: { code: "57014", message: "timeout" } },
      { rowsPerPage: 2 },
    );
    expect(result.data).toEqual([]);
    expect(result.error).toEqual({ code: "57014", message: "timeout" });
  });

  it("recusa truncagem silenciosa ao atingir o limite de leitura", async () => {
    await expect(
      loadCompleteInvoiceReceipts(
        ["invoice-a"],
        async () => ({ data: [receipt(1), receipt(2)], error: null }),
        { rowsPerPage: 2, maxPages: 2 },
      ),
    ).rejects.toThrow(/limite de leitura segura/);
  });

  it("estornos não liquidam a dívida, e cêntimos não acumulam resíduos", () => {
    const receipts: InvoiceReceiptRow[] = [
      { ...receipt(1), amount: 0.1 },
      { ...receipt(2), amount: 0.2 },
      { ...receipt(3), amount: 30, status: "reversed" },
      { ...receipt(4, "invoice-b"), amount: 10 },
    ];
    const totals = receiptsPaidByInvoice(receipts);
    expect(totals.get("invoice-a")).toBe(0.3);
    expect(totals.get("invoice-b")).toBe(10);
  });
});
