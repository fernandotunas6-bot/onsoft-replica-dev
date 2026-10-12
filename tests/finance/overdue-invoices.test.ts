import { describe, expect, it } from "vitest";
import { countOverdueInvoices } from "@/features/finance/overdue-invoices";
import { sumPaidByInvoice } from "@/features/finance/invoice-settlement";
import { memoryDb } from "../students/memory-db";

/** Auditoria 14: o painel contava em atraso faturas pagas cujo recibo ficava fora do corte. */
const SCHOOL = "school-a";
const invoice = (id: string, status: string, due: string, extra = {}) => ({
  id,
  school_id: SCHOOL,
  status,
  due_date: due,
  amount: 10000,
  discount_amount: 0,
  penalty_amount: 0,
  ...extra,
});

describe("faturas em atraso", () => {
  it("conta só as por pagar, vencidas e ainda com valor em falta", async () => {
    const store = memoryDb({
      finance_invoices: [
        invoice("vencida", "open", "2026-09-01"),
        invoice("parcial", "partially_paid", "2026-09-01"),
        invoice("paga", "paid", "2026-09-01"),
        invoice("anulada", "cancelled", "2026-09-01"),
        invoice("futura", "open", "2026-12-01"),
        invoice("coberta", "open", "2026-09-01"),
        invoice("com-multa", "partially_paid", "2026-09-01", { penalty_amount: 500 }),
      ],
      finance_receipts: [
        { school_id: SCHOOL, invoice_id: "parcial", amount: 4000, status: "issued" },
        { school_id: SCHOOL, invoice_id: "coberta", amount: 10000, status: "issued" },
        { school_id: SCHOOL, invoice_id: "com-multa", amount: 10000, status: "issued" },
        { school_id: SCHOOL, invoice_id: "vencida", amount: 10000, status: "reversed" },
      ],
    });
    // vencida (recibo anulado), parcial, com-multa (falta a multa)
    await expect(countOverdueInvoices(store.db, SCHOOL, "2026-10-10")).resolves.toBe(3);
  });

  it("soma do pago ignora recibos anulados", () => {
    const paid = sumPaidByInvoice([
      { invoice_id: "a", amount: 100, status: "issued" },
      { invoice_id: "a", amount: 50, status: "reversed" },
      { invoice_id: "a", amount: "25", status: "issued" },
    ]);
    expect(paid.get("a")).toBe(125);
  });
});
