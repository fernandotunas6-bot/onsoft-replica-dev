import { describe, expect, it } from "vitest";
import { applicationRoles } from "@/features/auth/access-policy";
import {
  canReadStudentFinance,
  canReadStudentHistory,
  canReadStudentSection,
  resolveStudentSection,
  STUDENT_SECTIONS,
  studentSectionLabel,
  validateStudentDetailSearch,
} from "@/features/students/student-sections";

describe("secção da ficha na URL", () => {
  it("aceita as secções conhecidas", () => {
    for (const { id } of STUDENT_SECTIONS) {
      expect(validateStudentDetailSearch({ secao: id })).toEqual({ secao: id });
    }
  });

  it("ignora o que não conhece, sem erro: abre a ficha completa", () => {
    expect(validateStudentDetailSearch({})).toEqual({});
    expect(validateStudentDetailSearch({ secao: "salarios" })).toEqual({});
    expect(validateStudentDetailSearch({ secao: ["financeiro"] })).toEqual({});
    expect(validateStudentDetailSearch({ secao: 1, outro: "x" })).toEqual({});
  });

  it("dá o nome de cada secção", () => {
    expect(studentSectionLabel("identificacao")).toBe("Identificação");
    expect(studentSectionLabel("financeiro")).toBe("Financeiro");
  });
});

describe("financeiro do aluno", () => {
  it("segue o servidor: Administração, Secretaria e Tesouraria", () => {
    const allowed = applicationRoles.filter((role) => canReadStudentFinance(role));
    expect(allowed).toEqual(["Administrador", "Secretaria", "Tesouraria"]);
  });

  it("«Nenhum» no módulo financeiro fecha-o também a esses cargos", () => {
    expect(canReadStudentFinance("Secretaria", { financeiro: "Nenhum" })).toBe(false);
    expect(canReadStudentFinance("Administrador", { financeiro: "Nenhum" })).toBe(false);
  });

  it("a permissão do módulo abre-o a um cargo elevável, nunca a aluno ou encarregado", () => {
    expect(canReadStudentFinance("Professor", { financeiro: "Leitura" })).toBe(true);
    expect(canReadStudentFinance("Encarregado", { financeiro: "Total" })).toBe(false);
    expect(canReadStudentFinance("Aluno", { financeiro: "Leitura" })).toBe(false);
  });
});

describe("secções que cada conta pode abrir", () => {
  const sectionsFor = (role: string, grants = {}) =>
    STUDENT_SECTIONS.map(({ id }) => id).filter((id) => canReadStudentSection(id, role, grants));

  it("a Secretaria abre todas", () => {
    expect(sectionsFor("Secretaria")).toEqual([
      "identificacao",
      "academico",
      "financeiro",
      "documentos",
      "historico",
    ]);
  });

  it("o encarregado não abre o financeiro nem os arquivos da escola", () => {
    expect(sectionsFor("Encarregado")).toEqual(["identificacao", "academico"]);
  });

  it("uma permissão «Nenhum» fecha a secção do seu módulo", () => {
    expect(sectionsFor("Secretaria", { pedagogica: "Nenhum", arquivos: "Nenhum" })).toEqual([
      "identificacao",
      "financeiro",
    ]);
  });
});

describe("histórico académico do aluno", () => {
  it("segue o servidor: só Administração e Secretaria", () => {
    const allowed = applicationRoles.filter((role) => canReadStudentHistory(role));
    expect(allowed).toEqual(["Administrador", "Secretaria"]);
  });

  it("nem o professor (só as suas turmas) nem o encarregado, com ou sem permissões", () => {
    expect(canReadStudentHistory("Professor", { pedagogica: "Total" })).toBe(false);
    expect(canReadStudentHistory("Encarregado", { pedagogica: "Total" })).toBe(false);
    expect(canReadStudentHistory("Tesouraria", { pedagogica: "Escrita" })).toBe(false);
  });

  it("«Nenhum» no Pedagógico tira a secção", () => {
    expect(canReadStudentHistory("Secretaria", { pedagogica: "Nenhum" })).toBe(false);
  });
});

describe("resolveStudentSection", () => {
  it("sem secção é a ficha completa", () => {
    expect(resolveStudentSection(undefined, "Secretaria")).toEqual({
      section: null,
      refused: null,
    });
  });

  it("abre a secção pedida quando a conta a pode ler", () => {
    expect(resolveStudentSection("financeiro", "Secretaria")).toEqual({
      section: "financeiro",
      refused: null,
    });
  });

  it("sem acesso, mostra a ficha completa e diz qual foi recusada", () => {
    expect(resolveStudentSection("financeiro", "Encarregado")).toEqual({
      section: null,
      refused: "financeiro",
    });
  });
});
