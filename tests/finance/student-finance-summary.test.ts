import { describe, expect, it } from "vitest";
import { summarizeStudentInvoices } from "@/features/finance/student-finance-summary";

const TODAY = "2026-10-26";

function invoice(
  id: string,
  status: string,
  due_on: string | null,
  total_amount: number,
  amount_paid = 0,
) {
  return { id, status, due_on, total_amount, amount_paid };
}

describe("summarizeStudentInvoices", () => {
  it("separa por pagar e pagas, com a dívida e a parte vencida", () => {
    const summary = summarizeStudentInvoices(
      [
        invoice("set", "paid", "2026-09-05", 20_000, 20_000),
        invoice("out", "issued", "2026-10-05", 20_000, 5_000),
        invoice("nov", "issued", "2026-11-05", 20_000),
        invoice("ago", "paid", "2026-08-05", 20_000, 20_000),
      ],
      TODAY,
    );
    expect(summary.billed).toBe(80_000);
    expect(summary.paid).toBe(45_000);
    expect(summary.outstanding).toBe(35_000);
    expect(summary.overdue).toBe(15_000);
    // Por pagar: o prazo mais antigo primeiro; pagas: o mais recente primeiro.
    expect(summary.open.map((row) => row.id)).toEqual(["out", "nov"]);
    expect(summary.settled.map((row) => row.id)).toEqual(["set", "ago"]);
    expect(summary.open[0]).toMatchObject({
      openAmount: 15_000,
      state: { status: "overdue", label: "Vencida · paga em parte" },
    });
    expect(summary.open[1]!.state.label).toBe("Por pagar");
  });

  it("uma fatura anulada não conta como faturada nem como dívida", () => {
    const summary = summarizeStudentInvoices(
      [invoice("a", "void", "2026-09-05", 20_000), invoice("b", "issued", null, 10_000)],
      TODAY,
    );
    expect(summary.billed).toBe(10_000);
    expect(summary.outstanding).toBe(10_000);
    expect(summary.overdue).toBe(0);
    expect(summary.open.map((row) => row.id)).toEqual(["b"]);
  });

  it("recibos acima do valor não dão dívida negativa nem pago a mais", () => {
    const summary = summarizeStudentInvoices(
      [invoice("a", "issued", "2026-09-05", 10_000, 12_000)],
      TODAY,
    );
    expect(summary.paid).toBe(10_000);
    expect(summary.outstanding).toBe(0);
    expect(summary.settled.map((row) => row.id)).toEqual(["a"]);
  });

  it("sem faturas, tudo a zero", () => {
    expect(summarizeStudentInvoices([], TODAY)).toEqual({
      billed: 0,
      paid: 0,
      outstanding: 0,
      overdue: 0,
      open: [],
      settled: [],
    });
  });
});
