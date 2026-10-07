import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { invoiceCompetenceMonth } from "@/features/finance/fee-items";

/**
 * Auditoria 13: a propina de Setembro emitida a 11/08 ficava como de Agosto (o mês da
 * emissão). Numa escola real ficaram duas propinas de Agosto pagas para o mesmo aluno.
 */
describe("mês a que a fatura respeita", () => {
  it("a propina é do mês do vencimento", () => {
    expect(
      invoiceCompetenceMonth({ kind: "tuition", dueOn: "2026-09-30", issuedOn: "2026-08-11" }),
    ).toBe("2026-09-01");
  });

  it("as outras taxas seguem a emissão", () => {
    for (const kind of ["enrollment", "service", "other", null]) {
      expect(invoiceCompetenceMonth({ kind, dueOn: "2026-09-30", issuedOn: "2026-08-11" })).toBe(
        "2026-08-01",
      );
    }
  });

  it("issueInvoice usa a regra e recusa uma segunda propina do mesmo mês", () => {
    const source = readFileSync("src/features/finance/server.ts", "utf8");
    const start = source.indexOf("export const issueInvoice = createServerFn");
    const body = source.slice(start, source.indexOf("export const", start + 1));
    expect(body).toContain("invoiceCompetenceMonth({");
    expect(body).not.toContain("(data.issuedOn ?? schoolTodayIso()).slice(0, 7)");
    const guard = body.indexOf('.eq("competence_month", competenceMonth)');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(body.indexOf('.from("finance_invoices")\n        .insert'));
  });
});
