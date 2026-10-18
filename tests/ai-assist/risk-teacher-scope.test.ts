import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/features/ai-assist/risk-followup.functions.ts", "utf8");
const block = (name: string) => {
  const start = source.indexOf(`export const ${name} = createServerFn`);
  const next = source.indexOf("export const ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
};

/** O professor via e alterava os casos de risco de toda a escola. */
describe("acompanhamento de risco: âmbito do professor", () => {
  it("quem não é Direcção nem Secretaria fica com as turmas que lecciona", () => {
    const ctx = source.slice(source.indexOf("async function ctx"));
    expect(ctx).toMatch(/role === "Administrador" \|\| role === "Secretaria"/);
    expect(ctx).toContain("teacherClassGroupIds(");
  });

  it("a lista filtra pelas turmas e cada escrita confirma a turma antes de gravar", () => {
    expect(block("listRiskCases")).toContain('.in("class_group_id", [...classScope])');
    for (const [name, write] of [
      ["saveRiskAnalysis", ".upsert("],
      ["addRiskIntervention", '.from("student_risk_interventions").insert('],
      ["saveAutomaticRiskSignals", ".update(common)"],
    ] as const) {
      const fn = block(name);
      const check = fn.indexOf("assertClassInScope(");
      expect(check, name).toBeGreaterThan(-1);
      expect(check, name).toBeLessThan(fn.indexOf(write));
    }
  });

  it("o nome do aluno no caso vem da base", () => {
    expect(block("saveRiskAnalysis")).toContain("names.get(s.enrollment_id)?.name");
  });
});

describe("planos de aula com avaliações", () => {
  it("não mudam de turma, disciplina ou período antes de gravar", () => {
    const src = readFileSync("src/features/lesson-plans/server.ts", "utf8");
    const update = src.slice(src.indexOf("export const updateLessonPlan"));
    const guard = update.indexOf("movesScope");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(update.indexOf('.from("siga_lesson_plans")\n      .update('));
    expect(update).toContain('.from("siga_lesson_plan_components")');
  });
});
