import { describe, expect, it } from "vitest";
import { generateSuggestions } from "@/features/intelligence/suggestion-engine";
import type { AppContext, SuggestionRule } from "@/features/intelligence/types";

type Snapshot = { flag: boolean };

const baseContext: AppContext = {
  userId: "user-1",
  role: "Administrador",
  grants: {},
  pathname: "/alunos/aluno-1",
  focusedEntity: {
    type: "student",
    id: "aluno-1",
    label: "Aluno Teste",
    schoolId: "escola-1",
    data: {},
  },
};

function rule(id: string, priority: number, matches = true): SuggestionRule<Snapshot> {
  return {
    id,
    evaluate: (snapshot) =>
      matches && snapshot.flag
        ? {
            id,
            priority,
            category: "geral",
            module: "pessoas",
            title: `Sugestão ${id}`,
            route: "/alunos",
            reason: "motivo de teste",
          }
        : null,
  };
}

describe("generateSuggestions", () => {
  it("orders suggestions by priority, descending", () => {
    const suggestions = generateSuggestions(baseContext, { flag: true }, [
      rule("baixa", 10),
      rule("alta", 90),
      rule("media", 50),
    ]);
    expect(suggestions.map((s) => s.priority)).toEqual([90, 50, 10]);
  });

  it("keeps declared rule order when priorities tie (stable sort)", () => {
    const suggestions = generateSuggestions(baseContext, { flag: true }, [
      rule("primeiro", 50),
      rule("segundo", 50),
    ]);
    expect(suggestions.map((s) => s.id)).toEqual([
      "student:aluno-1:primeiro",
      "student:aluno-1:segundo",
    ]);
  });

  it("drops rules that evaluate to null", () => {
    const suggestions = generateSuggestions(baseContext, { flag: false }, [rule("nunca", 90)]);
    expect(suggestions).toEqual([]);
  });

  it("namespaces suggestion ids by the focused entity", () => {
    const suggestions = generateSuggestions(baseContext, { flag: true }, [rule("x", 10)]);
    expect(suggestions[0]?.id).toBe("student:aluno-1:x");
  });
});
