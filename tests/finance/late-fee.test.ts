import { describe, expect, it } from "vitest";
import {
  invoiceAmountDue,
  lateFeeFor,
  lateFeeStartsOn,
  parseLateFeeScope,
} from "@/features/finance/late-fee";
import { invoiceNetTotal } from "@/features/finance/invoice-settlement";

const invoice = {
  amount: 10_000,
  discount_amount: 1_000,
  penalty_amount: 0,
  due_date: "2026-10-10",
};
const billing = { late_fee_percent: 5, grace_days: 5, late_fee_applies_to: "all" as const };

describe("multa por atraso (regra única)", () => {
  it("começa no dia seguinte ao fim da tolerância", () => {
    expect(lateFeeStartsOn("2026-10-10", 5)).toBe("2026-10-16");
    expect(lateFeeStartsOn("2026-10-31", 0)).toBe("2026-11-01");
    expect(lateFeeStartsOn(null, 5)).toBeNull();
  });

  it("igual a register_payment: paid_on > vencimento + tolerância", () => {
    expect(lateFeeFor(invoice, billing, "2026-10-15", "counter")).toBe(0);
    expect(lateFeeFor(invoice, billing, "2026-10-16", "counter")).toBe(500);
    expect(lateFeeFor(invoice, billing, "2026-10-16", "electronic")).toBe(500);
  });

  it("«só electrónicos» não cobra no balcão, mas uma multa gravada é dívida em todos", () => {
    const electronic = { ...billing, late_fee_applies_to: "electronic" as const };
    expect(lateFeeFor(invoice, electronic, "2026-11-01", "counter")).toBe(0);
    expect(lateFeeFor(invoice, electronic, "2026-11-01", "electronic")).toBe(500);
    expect(
      lateFeeFor({ ...invoice, penalty_amount: 500 }, electronic, "2026-11-01", "counter"),
    ).toBe(500);
  });

  it("não recalcula a multa gravada e não multa sem percentagem", () => {
    expect(
      lateFeeFor({ ...invoice, penalty_amount: 123.45 }, billing, "2027-01-01", "counter"),
    ).toBe(123.45);
    expect(lateFeeFor(invoice, { ...billing, late_fee_percent: 0 }, "2027-01-01", "counter")).toBe(
      0,
    );
  });

  it("total a pagar = valor − desconto + multa, igual em todos os canais", () => {
    expect(invoiceAmountDue(invoice, 500)).toBe(9_500);
    expect(invoiceAmountDue({ amount: 100, discount_amount: 200 }, 10)).toBe(10);
    expect(invoiceNetTotal({ ...invoice, penalty_amount: 500 })).toBe(9_500);
  });

  it("por omissão a multa aplica-se em todos os pagamentos", () => {
    expect(parseLateFeeScope(undefined)).toBe("all");
    expect(parseLateFeeScope("electronic")).toBe("electronic");
    expect(parseLateFeeScope("x")).toBe("all");
  });
});
