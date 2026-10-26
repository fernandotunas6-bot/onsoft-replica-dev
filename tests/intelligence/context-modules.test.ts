import { describe, expect, it } from "vitest";
import {
  canOpenEntityMenu,
  CONTEXT_ENTRIES,
  CONTEXT_MODULES,
  contextBackLink,
  contextKindLabel,
} from "@/features/intelligence/context-modules";
import type { ContextFrame, ResolvedContext } from "@/features/intelligence/types";

/**
 * Contribuições dos módulos (§7 e §19 do Prompt Master): cada módulo declara as
 * suas entidades, entradas, quem recebe o menu e «Voltar»; o motor só lê a lista.
 */

const context = (trail: ContextFrame[]): ResolvedContext => ({
  userId: "u",
  role: "Administrador",
  grants: {},
  pathname: "/",
  focusedEntity: null,
  schoolId: "school-a",
  academicYearId: null,
  trail,
  activeView: null,
  key: "k",
});
const frame = (type: ContextFrame["type"]): ContextFrame => ({ type, id: "x", label: "X" });

describe("contribuições dos módulos de contexto", () => {
  it("cada entrada pertence a um tipo que o seu módulo declara, e os ids são únicos", () => {
    for (const module of CONTEXT_MODULES) {
      for (const entry of module.entries) {
        for (const type of entry.contexts) expect(Object.keys(module.kinds)).toContain(type);
      }
    }
    const ids = CONTEXT_ENTRIES.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("um tipo pertence a um só módulo", () => {
    const types = CONTEXT_MODULES.flatMap((module) => Object.keys(module.kinds));
    expect(new Set(types).size).toBe(types.length);
  });

  it("nome do tipo no cabeçalho, e «Contexto» para um tipo sem módulo", () => {
    expect(contextKindLabel("subject-offering")).toBe("Disciplina");
    expect(contextKindLabel("invoice")).toBe("Fatura");
    expect(contextKindLabel("employee")).toBe("Funcionário");
    expect(contextKindLabel("finance-overview")).toBe("Contexto");
  });

  it("quem recebe o menu de cada entidade", () => {
    expect(canOpenEntityMenu("class", "Professor")).toBe(true);
    expect(canOpenEntityMenu("student", "Encarregado")).toBe(false);
    expect(canOpenEntityMenu("invoice", "Tesouraria")).toBe(true);
    expect(canOpenEntityMenu("invoice", "Secretaria")).toBe(false);
    expect(canOpenEntityMenu("employee", "Tesouraria")).toBe(true);
    expect(canOpenEntityMenu("employee", "Secretaria")).toBe(false);
    expect(canOpenEntityMenu("employee", "Professor")).toBe(false);
    expect(canOpenEntityMenu("class", "Tesouraria")).toBe(false);
    // Um tipo sem módulo nunca abre menu.
    expect(canOpenEntityMenu("dashboard-overview", "Administrador")).toBe(false);
  });

  it("«Voltar» de cada módulo, e o separador da página quando o módulo não diz", () => {
    expect(contextBackLink(context([frame("student")]), "/alunos/x", {})).toEqual({
      to: "/alunos",
    });
    expect(contextBackLink(context([frame("invoice")]), "/faturas/x", {})).toEqual({
      to: "/faturas",
    });
    expect(
      contextBackLink(context([frame("employee")]), "/financeiro/rh/funcionarios/x", {}),
    ).toEqual({ to: "/financeiro/rh/funcionarios" });
    expect(contextBackLink(context([frame("teacher")]), "/professores/x", {})).toEqual({
      to: "/pessoas",
    });
    expect(contextBackLink(context([frame("teacher")]), "/pedagogica/trabalhos", {})).toEqual({
      to: "/pedagogica",
    });
    expect(contextBackLink(context([frame("class")]), "/pedagogica/trabalhos", {})).toEqual({
      to: "/pedagogica",
      search: { tab: "turmas" },
    });
    expect(
      contextBackLink(context([frame("class")]), "/pedagogica", { tab: "notas", turma: "x" }),
    ).toEqual({ to: "/pedagogica", search: { tab: "notas" } });
  });
});
