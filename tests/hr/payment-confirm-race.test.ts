import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("confirmação de pagamento salarial", () => {
  const source = readFileSync("src/features/hr/payments.ts", "utf8");
  const confirm = source.slice(source.indexOf("export const confirmPayrollPaymentItem"));

  it("a saída criada é retirada se outro pedido confirmar o item primeiro", () => {
    expect(confirm).toContain("createdExpenseId = cashExpenseId;");
    const guard = confirm.indexOf("if (payError || !paidRow) {");
    expect(guard).toBeGreaterThan(-1);
    const block = confirm.slice(guard, guard + 700);
    expect(block).toContain('.from("siga_cash_expenses")');
    expect(block).toContain(".delete()");
    expect(block).toContain('.eq("id", createdExpenseId)');
  });

  it("uma saída já existente (retoma) nunca é apagada", () => {
    const reuse = confirm.indexOf("cashExpenseId = String(existingExpense.id);");
    expect(reuse).toBeGreaterThan(-1);
    expect(confirm.slice(reuse, reuse + 80)).not.toContain("createdExpenseId");
  });
});
