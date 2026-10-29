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

  it("permite apenas turmas OU ids seleccionados, com limite e escola activa", () => {
    const lote = bloco("const issueTuitionBatchInputSchema", "export const recordCashExpense");
    expect(lote).toContain("Boolean(value.classGroupId) !== Boolean(value.studentIds)");
    expect(lote).toContain("z.array(z.string().guid()).min(1).max(TUITION_BATCH_LIMIT)");
    expect(lote).toContain('.in("student_id", selectedIds)');
    expect(lote).toContain('.eq("school_id", membership.schoolId)');
    expect(lote).toContain('.eq("academic_year_id", academicYearId!)');
    expect(lote).toContain("studentIds.length !== selectedIds.length");
    expect(lote).toContain("const result: TuitionBatchResult");
  });

  it("o lote continua a reutilizar as garantias de valor, bolsa e unicidade mensal", () => {
    const individual = bloco("async function issueInvoiceFor(", "const TUITION_BATCH_LIMIT");
    expect(individual).toContain("scholarshipPercentFor(");
    expect(individual).toContain("sameMonth");
    expect(individual).toContain("competence_month");
    expect(individual).toContain('.eq("school_id", membership.schoolId)');
  });

  it("é por turma, com tecto, e quem já tem a propina do mês fica de fora sem parar o lote", () => {
    const lote = bloco("export const issueTuitionBatch = ", "export const recordCashExpense");
    expect(lote).toMatch(/\.eq\("class_group_id", data\.classGroupId!?\)/);
    expect(lote).toMatch(/TUITION_BATCH_LIMIT \+ 1/);
    expect(lote).toMatch(/já tem a propina[\s\S]+skipped\.push[\s\S]+failed\.push/);
  });
});
