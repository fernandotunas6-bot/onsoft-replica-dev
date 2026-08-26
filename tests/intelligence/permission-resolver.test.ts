import { describe, expect, it } from "vitest";
import { applicationRoles } from "@/features/auth/access-policy";
import { filterSuggestionsByPermission } from "@/features/intelligence/permission-resolver";
import type { Suggestion } from "@/features/intelligence/types";

const financeSuggestion: Suggestion = {
  id: "s1",
  title: "Regularizar faturas em atraso",
  route: "/faturas",
  category: "financeiro",
  module: "financeiro",
  priority: 90,
  reason: "Existem faturas vencidas por liquidar.",
};

const writeOnlySuggestion: Suggestion = {
  id: "s2",
  title: "Matricular aluno numa turma",
  route: "/alunos",
  category: "matricula",
  module: "pessoas",
  requiresWrite: true,
  priority: 95,
  reason: "Sem matrícula activa.",
};

describe("filterSuggestionsByPermission", () => {
  it("shows finance suggestions only to roles with finance module read access", () => {
    for (const role of applicationRoles) {
      const [result] = filterSuggestionsByPermission([financeSuggestion], role, {});
      const canSeeFinance =
        role === "Administrador" ||
        role === "Tesouraria" ||
        role === "Encarregado" ||
        role === "Aluno";
      expect(Boolean(result)).toBe(canSeeFinance);
    }
  });

  it("hides write-requiring suggestions from roles with only read access to the module", () => {
    const result = filterSuggestionsByPermission([writeOnlySuggestion], "Encarregado", {});
    expect(result).toEqual([]);
  });

  it("respects an explicit grant override even when the role has no static access", () => {
    const result = filterSuggestionsByPermission([financeSuggestion], "Professor", {
      financeiro: "Leitura",
    });
    expect(result).toEqual([financeSuggestion]);
  });
});
