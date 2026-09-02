import { describe, expect, it } from "vitest";
import { buildSchoolAlert } from "@/features/dashboard/alerts";

describe("School Alerts (Dashboard)", () => {
  it("não cria aviso se a quantidade for 0, negativa ou inválida", () => {
    expect(buildSchoolAlert("documentos", 0)).toBeNull();
    expect(buildSchoolAlert("faturas", -1)).toBeNull();
    expect(buildSchoolAlert("matricula", NaN)).toBeNull();
  });

  describe("Candidaturas", () => {
    it("usa o singular", () => {
      const alert = buildSchoolAlert("candidaturas", 1)!;
      expect(alert.title).toBe("1 candidatura por decidir");
      expect(alert.settingsPanel).toBe("matricula");
      expect(alert.href).toBeUndefined();
    });

    it("usa o plural", () => {
      const alert = buildSchoolAlert("candidaturas", 5)!;
      expect(alert.title).toBe("5 candidaturas por decidir");
      expect(alert.detail).toContain("Aceite ou recuse");
    });
  });

  describe("Matrícula", () => {
    it("usa o singular", () => {
      const alert = buildSchoolAlert("matricula", 1)!;
      expect(alert.title).toBe("1 aluno à espera de turma");
      expect(alert.href).toBe("/alunos");
      expect(alert.settingsPanel).toBeUndefined();
    });

    it("usa o plural", () => {
      const alert = buildSchoolAlert("matricula", 3)!;
      expect(alert.title).toBe("3 alunos à espera de turma");
      expect(alert.detail).toContain("Confirme a matrícula");
    });
  });

  describe("Documentos", () => {
    it("usa o singular", () => {
      const alert = buildSchoolAlert("documentos", 1)!;
      expect(alert.title).toBe("1 pedido de documento");
      expect(alert.href).toBe("/documentos");
    });

    it("usa o plural", () => {
      const alert = buildSchoolAlert("documentos", 12)!;
      expect(alert.title).toBe("12 pedidos de documento");
      expect(alert.detail).toContain("por emitir");
    });
  });

  describe("Faturas", () => {
    it("usa o singular", () => {
      const alert = buildSchoolAlert("faturas", 1)!;
      expect(alert.title).toBe("1 fatura em atraso");
      expect(alert.href).toBe("/faturas");
    });

    it("usa o plural", () => {
      const alert = buildSchoolAlert("faturas", 4)!;
      expect(alert.title).toBe("4 faturas em atraso");
      expect(alert.detail).toContain("vencimento ultrapassado");
    });
  });
});
