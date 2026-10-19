import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Auditoria 13: o professor abria a pauta de qualquer turma da escola, com as
 * médias de todos os alunos. Passa a ver só as das turmas onde dá aulas ou de que
 * é director de turma (a regra de `loadStudentScope`).
 */
const source = readFileSync("src/features/academic/grade-sheets.ts", "utf8");
const body = (name: string) => {
  const start = source.indexOf(`export const ${name}`);
  return source.slice(start, source.indexOf("export const", start + 1));
};

describe("pautas e o âmbito do professor", () => {
  it("o detalhe recusa uma turma fora do âmbito antes de ler as linhas", () => {
    const detail = body("getGradeSheetDetail");
    const check = detail.indexOf("visibleGradeSheetGroups(db, membership, context.userId)");
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(detail.indexOf('.from("grade_sheet_rows")'));
  });

  it("o quadro filtra turmas e pautas pelo mesmo âmbito", () => {
    const board = body("getGradeSheetBoard");
    expect(board).toContain("visibleGradeSheetGroups(db, membership, context.userId)");
    expect(board).toContain(".filter((g) => canSee(g.id))");
    expect(board).toContain(".filter((s) => canSee(s.class_group_id))");
  });

  it("Administração e Secretaria vêem tudo; o professor, as suas turmas", () => {
    const helper = source.slice(source.indexOf("async function visibleGradeSheetGroups"));
    expect(helper.slice(0, helper.indexOf("\n}\n"))).toContain("MANAGE_ROLES");
    expect(helper.slice(0, helper.indexOf("\n}\n"))).toContain("teacherClassGroupIds(");
  });
});
