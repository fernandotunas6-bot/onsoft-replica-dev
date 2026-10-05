import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { reversePayrollPaymentItemInputSchema } from "@/features/hr/schemas";

const migration = readFileSync(
  resolve(__dirname, "../../supabase/migrations/20261004130000_hr_reverse_payroll_payment.sql"),
  "utf8",
);

describe("anular um salário pago por engano", () => {
  it("exige motivo e a escolha do passo seguinte", () => {
    const base = { paymentItemId: "00000000-0000-4000-8000-000000000001" };
    expect(
      reversePayrollPaymentItemInputSchema.safeParse({ ...base, reason: "x", next: "repay" })
        .success,
    ).toBe(false);
    expect(
      reversePayrollPaymentItemInputSchema.safeParse({
        ...base,
        reason: "IBAN errado",
        next: "other",
      }).success,
    ).toBe(false);
    expect(
      reversePayrollPaymentItemInputSchema.safeParse({
        ...base,
        reason: "IBAN errado",
        next: "cancel",
      }).success,
    ).toBe(true);
  });

  it("um novo pagamento depois de anular leva o número seguinte (o número é único)", () => {
    // A confirmação é atómica na base (hr_confirm_payroll_payment_item); a saída anulada
    // mantém o número, por isso a função procura o primeiro livre (…-2, …-3).
    // O comportamento está ensaiado em tests/sql/payroll-confirmation.mjs.
    const confirm = readFileSync(
      resolve(
        __dirname,
        "../../supabase/migrations/20261005040000_hr_confirm_payment_free_expense_number.sql",
      ),
      "utf8",
    );
    expect(confirm).toContain("WHILE EXISTS (SELECT 1 FROM public.siga_cash_expenses");
    expect(confirm).toContain("v_number := v_batch.batch_number||'-'||v_item.id::text||'-'||v_n;");
    expect(confirm).toContain("VALUES(p_school_id,v_number,");
  });

  it("a função é só do servidor e faz tudo numa transacção", () => {
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION private\.hr_reverse_payroll_payment[^;]+FROM PUBLIC, anon, authenticated/,
    );
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.hr_reverse_payroll_payment[^;]+FROM PUBLIC, anon, authenticated/,
    );
    expect(migration).toMatch(/for update/);
    for (const table of [
      "siga_cash_expenses",
      "hr_payroll_payment_items",
      "hr_payroll_items",
      "hr_payroll_payment_batches",
      "hr_payroll_runs",
      "audit_logs",
    ]) {
      expect(migration, table).toContain(`public.${table}`);
    }
  });
});
