import { describe, expect, it } from "vitest";
import { buildTeacherSuggestionRules } from "@/features/intelligence/teachers/teacher-suggestion-rules";
import type { AppContext } from "@/features/intelligence/types";
import type { TeacherRelationsSnapshot } from "@/features/intelligence/teachers/teacher-relations-adapter";

const context: AppContext = {
  userId: "user-1",
  role: "Administrador",
  grants: {},
  pathname: "/professores/teacher-1",
  focusedEntity: {
    type: "teacher",
    id: "teacher-1",
    label: "Professor Teste",
    schoolId: "escola-1",
    data: {},
  },
};

const completeSnapshot: TeacherRelationsSnapshot = {
  teacherId: "teacher-1",
  profile: { hasEmail: true, hasPhone: true },
  classes: { count: 2, subjectCount: 2 },
  schedule: { count: 4 },
  enrollments: { count: 30 },
};

describe("buildTeacherSuggestionRules", () => {
  const rules = buildTeacherSuggestionRules("teacher-1");
  const byId = Object.fromEntries(rules.map((rule) => [rule.id, rule]));

  it("always includes a low-priority baseline suggestion", () => {
    expect(byId["emitir-credenciais"]?.evaluate(completeSnapshot, context)).not.toBeNull();
  });

  it("suggests assigning classes when the teacher has none", () => {
    const snapshot = { ...completeSnapshot, classes: { count: 0, subjectCount: 0 } };
    const suggestion = byId["sem-turmas-atribuidas"]?.evaluate(snapshot, context);
    expect(suggestion?.priority).toBe(90);
    expect(suggestion?.requiresWrite).toBe(true);
  });

  it("does not suggest assigning classes when already assigned", () => {
    expect(byId["sem-turmas-atribuidas"]?.evaluate(completeSnapshot, context)).toBeNull();
  });

  it("flags classes with no schedule slots", () => {
    const snapshot = { ...completeSnapshot, schedule: { count: 0 } };
    expect(byId["sem-horario"]?.evaluate(snapshot, context)).not.toBeNull();
  });

  it("does not flag missing schedule when there are no classes either", () => {
    const snapshot = {
      ...completeSnapshot,
      classes: { count: 0, subjectCount: 0 },
      schedule: { count: 0 },
    };
    expect(byId["sem-horario"]?.evaluate(snapshot, context)).toBeNull();
  });

  it("flags incomplete contact info", () => {
    const snapshot = { ...completeSnapshot, profile: { hasEmail: false, hasPhone: true } };
    expect(byId["contacto-incompleto"]?.evaluate(snapshot, context)).not.toBeNull();
  });

  it("never emits titles with technical jargon", () => {
    for (const rule of rules) {
      const suggestion = rule.evaluate(completeSnapshot, context);
      if (!suggestion) continue;
      expect(suggestion.title + " " + suggestion.reason).not.toMatch(/error|403|null|undefined/i);
    }
  });
});
