import { describe, expect, it } from "vitest";
import { buildClassSuggestionRules } from "@/features/intelligence/classes/class-suggestion-rules";
import type { AppContext } from "@/features/intelligence/types";
import type { ClassRelationsSnapshot } from "@/features/intelligence/classes/class-relations-adapter";

const context: AppContext = {
  userId: "user-1",
  role: "Administrador",
  grants: {},
  pathname: "/pedagogica",
  focusedEntity: {
    type: "class",
    id: "turma-1",
    label: "10ª A",
    schoolId: "escola-1",
    data: {},
  },
};

const healthySnapshot: ClassRelationsSnapshot = {
  classGroupId: "turma-1",
  enrollment: { count: 28, capacity: 30 },
  disciplinas: { count: 5, semProfessorCount: 0 },
  horario: { count: 10 },
  avaliacoes: { count: 40 },
  academic: { averageScore: 13, attendanceRate: 91 },
};

describe("buildClassSuggestionRules", () => {
  const rules = buildClassSuggestionRules("turma-1");
  const byId = Object.fromEntries(rules.map((rule) => [rule.id, rule]));

  it("always includes a low-priority baseline suggestion", () => {
    expect(byId["aplicar-curriculo"]?.evaluate(healthySnapshot, context)).not.toBeNull();
  });

  it("flags subjects without a teacher", () => {
    const snapshot = { ...healthySnapshot, disciplinas: { count: 5, semProfessorCount: 2 } };
    const suggestion = byId["disciplina-sem-professor"]?.evaluate(snapshot, context);
    expect(suggestion?.priority).toBe(90);
    expect(suggestion?.requiresWrite).toBe(true);
  });

  it("flags a class with no schedule", () => {
    const snapshot = { ...healthySnapshot, horario: { count: 0 } };
    expect(byId["sem-horario"]?.evaluate(snapshot, context)).not.toBeNull();
  });

  it("flags a nearly full class", () => {
    const snapshot = { ...healthySnapshot, enrollment: { count: 29, capacity: 30 } };
    expect(byId["turma-lotada"]?.evaluate(snapshot, context)).not.toBeNull();
  });

  it("does not flag capacity when there is no capacity set", () => {
    const snapshot = { ...healthySnapshot, enrollment: { count: 29, capacity: null } };
    expect(byId["turma-lotada"]?.evaluate(snapshot, context)).toBeNull();
  });

  it("flags enrolled students with no grades yet", () => {
    const snapshot = { ...healthySnapshot, avaliacoes: { count: 0 } };
    expect(byId["sem-avaliacoes"]?.evaluate(snapshot, context)).not.toBeNull();
  });

  it("does not flag missing grades when there are no students enrolled", () => {
    const snapshot = {
      ...healthySnapshot,
      enrollment: { count: 0, capacity: 30 },
      avaliacoes: { count: 0 },
    };
    expect(byId["sem-avaliacoes"]?.evaluate(snapshot, context)).toBeNull();
  });
});
