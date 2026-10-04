import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  assertAssessmentTermNotLocked,
  assertGradesNotLocked,
} from "@/features/academic/sga-grades";

type Result = { data: unknown; error: { code?: string; message: string } | null };

/** Cliente mínimo: cada tabela devolve o resultado dado, seja qual for o filtro. */
function fakeDb(tables: Record<string, Result>) {
  return {
    from(table: string) {
      const result = tables[table] ?? { data: null, error: null };
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "eq", "in"]) chain[method] = () => chain;
      chain["maybeSingle"] = async () => result;
      chain["then"] = (resolve: (value: Result) => unknown) => resolve(result);
      return chain;
    },
  } as never;
}

const school = "s";
const group = "g";

describe("bloqueio por pauta oficial: erros da base e avaliações", () => {
  it("recusa quando a pauta do período está homologada", async () => {
    const db = fakeDb({
      grade_sheets: { data: [{ kind: "term", term_id: "t1", status: "homologated" }], error: null },
    });
    await expect(assertGradesNotLocked(db, school, group, "t1")).rejects.toThrow(/pauta/i);
  });

  it("a pauta anual oficial fecha todos os períodos", async () => {
    const db = fakeDb({
      grade_sheets: { data: [{ kind: "annual", term_id: null, status: "published" }], error: null },
    });
    await expect(assertGradesNotLocked(db, school, group, "t2")).rejects.toThrow();
  });

  it("tabela ausente: nada a bloquear", async () => {
    const db = fakeDb({
      grade_sheets: { data: null, error: { code: "42P01", message: "relation does not exist" } },
    });
    await expect(assertGradesNotLocked(db, school, group, "t1")).resolves.toBeUndefined();
  });

  it("outro erro da base recusa em vez de deixar gravar", async () => {
    const db = fakeDb({
      grade_sheets: { data: null, error: { code: "57014", message: "statement timeout" } },
    });
    await expect(assertGradesNotLocked(db, school, group, "t1")).rejects.toThrow();
  });

  it("avaliações: encontra o período pela turma e aplica o mesmo bloqueio", async () => {
    const db = fakeDb({
      class_groups: { data: { academic_year_id: "y" }, error: null },
      terms: { data: { id: "t1" }, error: null },
      grade_sheets: { data: [{ kind: "term", term_id: "t1", status: "closed" }], error: null },
    });
    await expect(assertAssessmentTermNotLocked(db, school, group, 1)).rejects.toThrow();
  });
});

describe("avaliações: âmbito do professor e período fechado", () => {
  const secure = readFileSync("src/features/academic/server-secure-legacy.ts", "utf8");
  const legacy = readFileSync("src/features/academic/server-legacy.ts", "utf8");

  it("editar avaliação passa pelo âmbito do professor (não é re-exportada sem filtro)", () => {
    expect(secure).toMatch(/export const updateAssessmentItem = createServerFn/);
    const block = secure.slice(secure.indexOf("export const updateAssessmentItem"));
    expect(block.slice(0, block.indexOf("legacy.updateAssessmentItem"))).toContain("pairKeys.has");
    const reexports = secure.slice(
      secure.indexOf("export {"),
      secure.indexOf('} from "./server-legacy"'),
    );
    expect(reexports).not.toContain("updateAssessmentItem");
  });

  it("editar e apagar avaliação verificam a pauta oficial antes de escrever", () => {
    const update = legacy.slice(legacy.indexOf("export const updateAssessmentItem"));
    expect(update.indexOf("assertAssessmentTermNotLocked")).toBeGreaterThan(-1);
    expect(update.indexOf("assertAssessmentTermNotLocked")).toBeLessThan(
      update.indexOf(".update({"),
    );
    const del = secure.slice(secure.indexOf("export const deleteAssessmentItem"));
    expect(del.indexOf("assertAssessmentTermNotLocked")).toBeGreaterThan(-1);
    expect(del.indexOf("assertAssessmentTermNotLocked")).toBeLessThan(
      del.indexOf("delete_sga_assessment_item"),
    );
  });

  it("notas das avaliações: período aberto e pauta não oficial", () => {
    const scores = legacy.slice(legacy.indexOf("export const upsertAssessmentScores"));
    expect(scores.indexOf("assertAssessmentTermNotLocked")).toBeGreaterThan(-1);
    expect(scores.indexOf("assertAssessmentTermNotLocked")).toBeLessThan(
      scores.indexOf('from("siga_assessment_scores")'),
    );
  });
});
