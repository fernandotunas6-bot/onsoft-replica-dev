import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("estorno de saídas de caixa", () => {
  const source = readFileSync("src/features/finance/server.ts", "utf8");
  const reverse = source.slice(
    source.indexOf("export const reverseCashEntry"),
    source.indexOf("export const createPaymentPlan"),
  );

  it("uma saída que pagou um salário não se anula no caixa", () => {
    const check = reverse.indexOf('.from("hr_payroll_payment_items")');
    expect(check).toBeGreaterThan(-1);
    expect(reverse.slice(check, check + 300)).toContain('.eq("cash_expense_id", data.cashEntryId)');
    expect(check).toBeLessThan(reverse.indexOf('status: "reversed"'));
  });

  it("um erro ao verificar recusa em vez de anular", () => {
    expect(reverse).toContain("if (payrollLinkError && !isMissingSgaTable(payrollLinkError))");
  });
});
