import { describe, expect, it } from "vitest";
import { buildBulkClassFeedback } from "@/features/students/batch-feedback";

const names = new Map([
  ["s-1", "Ana Pereira"],
  ["s-2", "João Maria"],
  ["s-3", "Pedro Neto"],
  ["s-4", "Maria Sungo"],
  ["s-5", "Manuel Jorge"],
  ["s-6", "Aida Lemos"],
]);

describe("resultado de atribuição de turma em lote", () => {
  it("sem falhas, não conserva a selecção e mostra a contagem real", () => {
    const result = buildBulkClassFeedback(
      { count: 2, className: "8.ª A", failed: [] },
      ["s-1", "s-2"],
      names,
    );
    expect(result.successMessage).toContain("2 aluno(s) na turma 8.ª A");
    expect(result.failureMessage).toBeNull();
    expect(result.retryStudentIds).toEqual([]);
  });

  it("em êxito parcial mantém apenas os alunos falhados, na ordem seleccionada", () => {
    const result = buildBulkClassFeedback(
      {
        count: 2,
        className: "8.ª A",
        failed: [{ studentId: "s-3", message: "Lotação actualizada noutra sessão." }],
      },
      ["s-3", "s-1", "s-2"],
      names,
    );
    expect(result.retryStudentIds).toEqual(["s-3"]);
    expect(result.failureMessage).toContain("1 aluno(s) não ficaram matriculados");
    expect(result.failureDetails).toContain("Pedro Neto: Lotação actualizada");
    expect(result.successMessage).toContain("2 aluno(s)");
  });

  it("em falha total não apresenta mensagem de sucesso", () => {
    const result = buildBulkClassFeedback(
      {
        count: 0,
        className: "9.ª B",
        failed: [{ studentId: "s-2", message: "Sem autorização nesta escola." }],
      },
      ["s-2"],
      names,
    );
    expect(result.successMessage).toBeNull();
    expect(result.retryStudentIds).toEqual(["s-2"]);
    expect(result.failureDetails).toContain("João Maria");
  });

  it("lista no máximo quatro motivos e preserva todos os IDs para retentativa", () => {
    const failures = ["s-1", "s-2", "s-3", "s-4", "s-5", "s-6"].map((studentId) => ({
      studentId,
      message: "Turma alterada",
    }));
    const result = buildBulkClassFeedback(
      { count: 0, className: "9.ª B", failed: failures },
      ["s-1", "s-2", "s-3", "s-4", "s-5", "s-6"],
      names,
    );
    expect(result.failureDetails).toContain("E mais 2 aluno(s)");
    expect(result.failureDetails).not.toContain("Aida Lemos:");
    expect(result.retryStudentIds).toHaveLength(6);
  });

  it("não selecciona um aluno que não fazia parte do pedido", () => {
    const result = buildBulkClassFeedback(
      {
        count: 0,
        className: "8.ª A",
        failed: [{ studentId: "s-999", message: "Falha de validação" }],
      },
      ["s-1"],
      names,
    );
    expect(result.retryStudentIds).toEqual([]);
    expect(result.failureDetails).toContain("s-999: Falha de validação");
  });
});
