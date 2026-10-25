import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("auditoria das despesas de caixa", () => {
  it("registar, estornar ou apagar uma despesa fica em audit_logs, como nas faturas", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20261025100000_cash_expenses_audit_and_approval.sql"),
      "utf8",
    );
    expect(sql).toMatch(
      /AFTER INSERT OR DELETE OR UPDATE ON public\.siga_cash_expenses\s+FOR EACH ROW EXECUTE FUNCTION private\.audit_row_change\(\)/,
    );
  });
});
