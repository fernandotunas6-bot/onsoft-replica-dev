import { describe, expect, it } from "vitest";
import { buildStudentSuggestionRules } from "@/features/intelligence/students/student-suggestion-rules";
import type { AppContext } from "@/features/intelligence/types";
import type { StudentRelationsSnapshot } from "@/features/intelligence/students/student-relations-adapter";

const context: AppContext = {
  userId: "user-1",
  role: "Administrador",
  grants: {},
  pathname: "/alunos/student-1",
  focusedEntity: {
    type: "student",
    id: "student-1",
    label: "Aluno Teste",
    schoolId: "escola-1",
    data: {},
  },
};

const completeSnapshot: StudentRelationsSnapshot = {
  studentId: "student-1",
  enrollment: { id: "enroll-1", status: "active", className: "10ª A", gradeName: "10ª Classe" },
  academic: { finalAverage: 14, attendanceRate: 92, hasHistory: true },
  finance: { hasData: true, overdueCount: 0, overallStatus: "settled" },
  documents: { hasData: true, pendingCount: 0 },
  guardians: { count: 1, hasPrimary: true },
};

describe("buildStudentSuggestionRules", () => {
  const rules = buildStudentSuggestionRules("student-1");
  const byId = Object.fromEntries(rules.map((rule) => [rule.id, rule]));

  it("always includes a low-priority baseline suggestion", () => {
    expect(byId["declaracao-escolar"]?.evaluate(completeSnapshot, context)).not.toBeNull();
  });

  it("suggests enrolling the student when there is no active enrollment", () => {
    const snapshot = {
      ...completeSnapshot,
      enrollment: { ...completeSnapshot.enrollment, id: null },
    };
    const suggestion = byId["matricula-em-falta"]?.evaluate(snapshot, context);
    expect(suggestion?.priority).toBe(95);
    expect(suggestion?.requiresWrite).toBe(true);
  });

  it("does not suggest enrollment when already enrolled", () => {
    expect(byId["matricula-em-falta"]?.evaluate(completeSnapshot, context)).toBeNull();
  });

  it("flags overdue invoices", () => {
    const snapshot = {
      ...completeSnapshot,
      finance: { hasData: true, overdueCount: 2, overallStatus: "overdue" as const },
    };
    const suggestion = byId["financeiro-em-atraso"]?.evaluate(snapshot, context);
    expect(suggestion?.module).toBe("financeiro");
    expect(suggestion?.description).toContain("2");
  });

  it("flags a missing guardian", () => {
    const snapshot = { ...completeSnapshot, guardians: { count: 0, hasPrimary: false } };
    expect(byId["encarregado-em-falta"]?.evaluate(snapshot, context)).not.toBeNull();
  });

  it("does not flag documents when workspace data is unavailable", () => {
    const snapshot = { ...completeSnapshot, documents: { hasData: false, pendingCount: 3 } };
    expect(byId["documento-pendente"]?.evaluate(snapshot, context)).toBeNull();
  });

  it("flags a below-passing final average", () => {
    const snapshot = {
      ...completeSnapshot,
      academic: { ...completeSnapshot.academic, finalAverage: 8 },
    };
    expect(byId["nota-critica"]?.evaluate(snapshot, context)).not.toBeNull();
  });

  it("never emits titles with technical jargon", () => {
    for (const rule of rules) {
      const suggestion = rule.evaluate(completeSnapshot, context);
      if (!suggestion) continue;
      expect(suggestion.title + " " + suggestion.reason).not.toMatch(/error|403|null|undefined/i);
    }
  });
});
