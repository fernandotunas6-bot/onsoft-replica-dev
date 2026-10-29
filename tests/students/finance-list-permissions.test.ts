import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  canIssueStudentTuition,
  canReadStudentSection,
} from "@/features/students/student-sections";

describe("alunos: permissões financeiras na lista", () => {
  it("não expõe dados financeiros ao professor sem grant", () => {
    expect(canReadStudentSection("financeiro", "Professor", {})).toBe(false);
    expect(canReadStudentSection("financeiro", "Professor", { financeiro: "Nenhum" })).toBe(false);
  });

  it("respeita a autorização e o bloqueio explícito do módulo", () => {
    expect(canReadStudentSection("financeiro", "Tesouraria", {})).toBe(true);
    expect(canReadStudentSection("financeiro", "Secretaria", { financeiro: "Nenhum" })).toBe(false);
    expect(canReadStudentSection("financeiro", "Professor", { financeiro: "Leitura" })).toBe(true);
  });

  it("só permite emitir propinas com permissão de escrita", () => {
    expect(canIssueStudentTuition("Tesouraria", {})).toBe(true);
    expect(canIssueStudentTuition("Administrador", {})).toBe(true);
    expect(canIssueStudentTuition("Secretaria", { financeiro: "Leitura" })).toBe(false);
    expect(canIssueStudentTuition("Tesouraria", { financeiro: "Nenhum" })).toBe(false);
    expect(canIssueStudentTuition("Professor", {})).toBe(false);
    expect(canIssueStudentTuition("Professor", { financeiro: "Leitura" })).toBe(false);
    expect(canIssueStudentTuition("Professor", { financeiro: "Escrita" })).toBe(true);
    expect(canIssueStudentTuition("Aluno", { financeiro: "Total" })).toBe(false);
  });

  it("não mostra acções de escrita a quem só pode ler dívidas", () => {
    const bulk = readFileSync("src/features/students/components/StudentBulkTools.tsx", "utf8");
    const page = readFileSync("src/routes/alunos/index.tsx", "utf8");
    expect(bulk).toContain("{canIssueTuition ? (");
    expect(bulk).toContain("{canReadFinance ? (");
    expect(page).toContain("canIssueTuition={canIssueTuition}");
    expect(page).toContain("canReadFinance={canReadFinance}");
  });

  it("particiona a cache da lista por utilizador, escola, cargo e permissão", () => {
    const route = readFileSync("src/routes/alunos/index.tsx", "utf8");
    expect(route).toContain("currentAccount.id,");
    expect(route).toContain("currentAccount.schoolId,");
    expect(route).toContain("currentAccount.role,");
    expect(route).toContain("canReadFinance,");
    expect(route).toContain("enabled: Boolean(currentAccount.id && currentAccount.schoolId)");
  });

  it("não exporta colunas financeiras sem autorização", () => {
    const route = readFileSync("src/routes/alunos/index.tsx", "utf8");
    expect(route).toContain('...(canReadFinance\n      ? [\n          {\n            label: "Pagamento"');
  });

  it("a lista móvel não mostra a dívida sem autorização financeira", () => {
    const mobile = readFileSync("src/features/students/components/StudentMobileList.tsx", "utf8");
    expect(mobile).toContain("financeAllowed && student.debt_amount");
    expect(mobile).toContain("hidden: !financeAllowed");
  });

  it("o servidor verifica o direito antes de ler facturas e omite os valores sem acesso", () => {
    const server = readFileSync("src/features/students/server.ts", "utf8");
    expect(server).toContain("const canReadFinance = await requireSgaWriterFor(");
    expect(server).toContain("if (canReadFinance && enrollmentIds.length)");
    expect(server).toContain("payment_status: canReadFinance ? finSnapshot.paymentStatus : null");
    expect(server).toContain("debt_amount: canReadFinance ? finSnapshot.debtAmount : undefined");
    expect(server).toContain("total_paid: canReadFinance ? finSnapshot.totalPaid : undefined");
  });
});
