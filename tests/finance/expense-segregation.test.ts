import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EXPENSE_APPROVAL_THRESHOLD } from "@/features/finance/schemas";

/**
 * Separação de funções nas despesas (§8 do plano, decidido a 25/10/2026): acima de
 * 50 000 Kz a despesa espera por um Administrador que não a registou, e quem regista
 * uma despesa nunca a anula sozinho.
 */
const server = readFileSync(join(process.cwd(), "src/features/finance/server.ts"), "utf8");
const bloco = (inicio: string, fim: string) =>
  server.slice(server.indexOf(inicio), server.indexOf(fim, server.indexOf(inicio) + 1));

describe("despesas: quem regista não aprova nem anula", () => {
  it("acima do limite a despesa fica por aprovar", () => {
    expect(EXPENSE_APPROVAL_THRESHOLD).toBe(50_000);
    const registo = bloco("export const recordCashExpense", "export const ");
    expect(registo).toMatch(/needsApproval = data\.amount > EXPENSE_APPROVAL_THRESHOLD/);
    expect(registo).toMatch(/needsApproval \? "pending_approval" : "posted"/);
  });

  it("a aprovação é só de Administrador e exclui quem registou, também no UPDATE", () => {
    const aprovar = bloco("export const approveCashExpense", "export const createPaymentPlan");
    expect(aprovar).toMatch(/\["Administrador"\]/);
    expect(aprovar).toMatch(/current\.created_by === context\.userId/);
    expect(aprovar).toMatch(/\.neq\("created_by", context\.userId\)/);
  });

  it("o estorno recusa quem registou a despesa, também no UPDATE", () => {
    const estorno = bloco("export const reverseCashEntry", "export const ");
    expect(estorno).toMatch(/current\?\.created_by && current\.created_by === context\.userId/);
    expect(estorno).toMatch(/created_by\.is\.null,created_by\.neq\./);
  });

  it("uma despesa por aprovar não conta como saída no relatório", () => {
    expect(server).toMatch(
      /expense\.status === "reversed" \|\| expense\.status === "pending_approval"/,
    );
  });
});
