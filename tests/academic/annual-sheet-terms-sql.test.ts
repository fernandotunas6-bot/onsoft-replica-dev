import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// A pauta anual (build_grade_sheet) e o motor em TS têm de decidir igual:
// disciplina sem nota num período do ano → linha «incomplete».
const sql = readFileSync(
  "supabase/migrations/20261002160000_annual_sheet_requires_all_terms.sql",
  "utf8",
);

describe("20261002160000: pauta anual exige todos os períodos", () => {
  it("conta os períodos do ano da turma", () => {
    expect(sql).toMatch(
      /select count\(\*\) into expected_terms from public\.terms\s+where school_id = target_school_id and academic_year_id = group_row\.academic_year_id/,
    );
  });

  it("guarda o período em cada entrada do subject_breakdown", () => {
    expect(sql).toContain("'termId', book_row.term_id");
    expect(sql).toContain("select gb.id, gb.term_id, sub.name as subject_name");
  });

  it("incompleta depois das faltas e antes da disciplina-chave e da média", () => {
    const order = [
      "when absence_pct > active_rule.maximum_absence_percentage then 'fail'",
      "when missing_terms then 'incomplete'",
      "when key_fail then 'fail'",
    ].map((line) => sql.indexOf(line));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("mantém a guarda de 2FA e permissão", () => {
    expect(sql).toContain(
      "if actor is null or not private.is_aal2() or not private.has_permission(target_school_id, 'assessment.grades.manage')",
    );
    expect(sql).toContain("SET search_path TO ''");
  });
});
