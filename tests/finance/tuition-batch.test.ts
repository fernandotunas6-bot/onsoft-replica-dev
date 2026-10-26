import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A emissão em lote não pode ter uma lógica própria de preço, bolsa ou verificação do
 * mês: se divergisse da individual, o lote cobraria valores diferentes ao mesmo aluno.
 */
const server = readFileSync(join(process.cwd(), "src/features/finance/server.ts"), "utf8");
const bloco = (inicio: string, fim: string) =>
  server.slice(server.indexOf(inicio), server.indexOf(fim));

describe("propinas em lote", () => {
  it("a emissão individual e a de lote passam pela mesma função", () => {
    const individual = bloco("export const issueInvoice = ", "async function issueInvoiceFor(");
    expect(individual).toMatch(/return issueInvoiceFor\(db, membership, context\.userId, data\)/);
    const lote = bloco("export const issueTuitionBatch = ", "export const recordCashExpense");
    expect(lote).toMatch(/await issueInvoiceFor\(db, membership, context\.userId,/);
    expect(lote).not.toMatch(/\.from\("finance_invoices"\)/);
  });

  it("é por turma, com tecto, e quem já tem a propina do mês fica de fora sem parar o lote", () => {
    const lote = bloco("export const issueTuitionBatch = ", "export const recordCashExpense");
    expect(lote).toMatch(/\.eq\("class_group_id", data\.classGroupId\)/);
    expect(lote).toMatch(/TUITION_BATCH_LIMIT \+ 1/);
    expect(lote).toMatch(/já tem a propina[\s\S]+skipped\.push[\s\S]+failed\.push/);
  });
});
