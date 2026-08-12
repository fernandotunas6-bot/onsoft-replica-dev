import { describe, expect, it } from "vitest";
import {
  cancelInvoiceInputSchema,
  cancelPaymentPlanInputSchema,
  officialReceiptBody,
  paymentStatusFromInvoices,
} from "@/features/finance/schemas";

describe("officialReceiptBody", () => {
  it("inclui aluno, fatura e valor", () => {
    const text = officialReceiptBody({
      schoolName: "Escola SIGA",
      studentName: "Ana Domingos",
      invoiceNumber: "FT-2026-0001",
      receiptNumber: "RC-2026-0001",
      amountLabel: "45 000 Kz",
    });
    expect(text).toContain("Ana Domingos");
    expect(text).toContain("FT-2026-0001");
    expect(text).toContain("RC-2026-0001");
  });
});

describe("paymentStatusFromInvoices", () => {
  it("devolve null sem faturas", () => {
    expect(paymentStatusFromInvoices([])).toBeNull();
  });

  it("marca liquidado quando todas estão pagas", () => {
    expect(
      paymentStatusFromInvoices([
        { status: "paid", due_on: "2026-01-10" },
        { status: "void", due_on: "2026-01-01" },
      ]),
    ).toBe("settled");
  });

  it("marca em dívida quando há fatura vencida em aberto", () => {
    expect(
      paymentStatusFromInvoices(
        [{ status: "issued", due_on: "2026-01-01" }],
        "2026-08-11",
      ),
    ).toBe("overdue");
  });

  it("marca pendente quando ainda não venceu", () => {
    expect(
      paymentStatusFromInvoices(
        [{ status: "partial", due_on: "2026-12-01" }],
        "2026-08-11",
      ),
    ).toBe("pending");
  });
});

describe("cancelInvoiceInputSchema", () => {
  it("exige o id da fatura", () => {
    expect(cancelInvoiceInputSchema.safeParse({}).success).toBe(false);
    expect(
      cancelInvoiceInputSchema.parse({ invoiceId: "11111111-1111-1111-1111-111111111111" })
        .invoiceId,
    ).toHaveLength(36);
  });
});

describe("cancelPaymentPlanInputSchema", () => {
  it("exige o id do plano", () => {
    expect(cancelPaymentPlanInputSchema.safeParse({}).success).toBe(false);
    expect(
      cancelPaymentPlanInputSchema.parse({ planId: "11111111-1111-1111-1111-111111111111" })
        .planId,
    ).toHaveLength(36);
  });
});
