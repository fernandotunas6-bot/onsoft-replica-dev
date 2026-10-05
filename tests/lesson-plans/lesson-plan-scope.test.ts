import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/features/lesson-plans/server.ts", "utf8");
const handler = (name: string) => {
  const start = source.indexOf(`export const ${name}`);
  const next = source.indexOf("export const ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
};

describe("planos de aula", () => {
  it("o professor só planeia as turmas e disciplinas que lecciona", () => {
    expect(source).toContain("Só pode planear as turmas e disciplinas que lecciona.");
    expect(source).toContain("Esta disciplina não pertence à turma escolhida.");
  });

  it("criar, editar e apagar validam o âmbito do plano", () => {
    expect(handler("createLessonPlan")).toContain("assertLessonPlanScope(");
    const update = handler("updateLessonPlan");
    expect(update).toContain("loadPlanScope(");
    expect(update.match(/assertLessonPlanScope\(/g)?.length).toBe(2);
    expect(handler("deleteLessonPlan")).toContain("assertLessonPlanScope(");
  });

  it("não cria nem retira avaliações num período fechado", () => {
    const save = source.slice(source.indexOf("async function saveComponents"));
    expect(save).toContain(
      "assertAssessmentTermNotLocked(db, schoolId, scope.classGroupId, scope.term)",
    );
    const firstCheck = save.indexOf("await ensureTermOpen();");
    expect(firstCheck).toBeGreaterThan(-1);
    expect(firstCheck).toBeLessThan(
      save.indexOf('.from("siga_lesson_plan_components")\n        .insert'),
    );
  });
});
