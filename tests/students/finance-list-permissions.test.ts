import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canReadStudentSection } from "@/features/students/student-sections";

describe("alunos: permissões financeiras na lista", () => {
  it("não expõe dados financeiros ao professor sem grant", () => {
    expect(canReadStudentSection("financeiro", "Professor", {})).toBe(false);
    expect(canReadStudentSection("financeiro", "Professor", { financeiro: "Nenhum" })).toBe(
      false,
    );
  });

  it("respeita a autorização e o bloqueio explícito do módulo", () => {
    expect(canReadStudentSection("financeiro", "Tesouraria", {})).toBe(true);
    expect(canReadStudentSection("financeiro", "Secretaria", { financeiro: "Nenhum" })).toBe(
      false,
    );
    expect(canReadStudentSection("financeiro", "Professor", { financeiro: "Leitura" })).toBe(
      true,
    );
  });

  it("a lista móvel não mostra a dívida sem autorização financeira", () => {
    const mobile = readFileSync("src/features/students/components/StudentMobileList.tsx", "utf8");
    expect(mobile).toContain("financeAllowed && student.debt_amount");
    expect(mobile).toContain("hidden: !financeAllowed");
  });

  it("o servidor verifica o direito antes de ler facturas e omite os valores sem acesso", () => {
    const server = readFileSync("src/features/students/server.ts", "utf8");
    expect(server).toContain('const canReadFinance = await requireSgaWriterFor(');
    expect(server).toContain('if (canReadFinance && enrollmentIds.length)');
    expect(server).toContain('payment_status: canReadFinance ? finSnapshot.paymentStatus : null');
    expect(server).toContain('debt_amount: canReadFinance ? finSnapshot.debtAmount : undefined');
    expect(server).toContain('total_paid: canReadFinance ? finSnapshot.totalPaid : undefined');
  });
});
