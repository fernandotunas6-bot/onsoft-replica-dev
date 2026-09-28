/**
 * Histórico académico ligado à pauta, com rasto e sem remoção directa.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = resolve(__dirname, "../..");
const sql = readFileSync(
  resolve(REPO, "supabase/migrations/20260929170000_academic_history_linked.sql"),
  "utf8",
).replace(/--.*$/gm, "");
const server = readFileSync(resolve(REPO, "src/features/academic/final-results.ts"), "utf8");

describe("histórico académico", () => {
  it("liga cada registo à matrícula e à pauta anual", () => {
    for (const column of [
      "enrollment_id",
      "grade_sheet_id",
      "subject_results",
      "absence_percentage",
    ]) {
      expect(sql).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS ${column}`));
      expect(server).toContain(`${column}:`);
    }
  });

  it("fica no registo de auditoria, com o valor anterior nas rectificações", () => {
    expect(sql).toMatch(/CREATE TRIGGER audit_student_academic_history[\s\S]*audit_row_change/);
    expect(server).toMatch(/student_academic_history\.rectified/);
    expect(server).toMatch(/before: \{ outcome:/);
  });

  it("não se apaga directamente, mas deixa passar a cascata do aluno ou da escola", () => {
    expect(sql).toMatch(/BEFORE DELETE ON public\.student_academic_history/);
    expect(sql).toMatch(/pg_trigger_depth\(\) > 1/);
  });
});
