import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Tabelas com dados sensíveis que o código só lê pelo servidor (chave de
 * serviço + `requireSgaWriter`). Não podem ter acesso directo pela API:
 * `is_school_member` é verdadeiro para alunos e encarregados, e com ele
 * qualquer aluno leria ou apagaria os dados de toda a escola.
 */
const MIGRATIONS = {
  "supabase/migrations/20260925160000_academic_guards_risk_followup_appypay.sql": [
    "student_risk_cases",
    "student_risk_interventions",
    "payment_gateway_charges",
  ],
  "supabase/migrations/20260925162000_lesson_plans_and_subject_guards.sql": [
    "siga_lesson_plans",
    "siga_lesson_plan_components",
  ],
};

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const withoutComments = (sql: string) => sql.replace(/--.*$/gm, "");

describe("tabelas sensíveis só acessíveis pelo servidor", () => {
  for (const [path, tables] of Object.entries(MIGRATIONS)) {
    const sql = withoutComments(read(path));

    for (const table of tables) {
      it(`${table}: sem GRANT a authenticated/anon e sem política de membro`, () => {
        const grant = new RegExp(
          `GRANT[^;]*ON\\s+public\\.${table}\\s+TO\\s+(authenticated|anon)`,
          "i",
        );
        expect(sql).not.toMatch(grant);
        const memberPolicy = new RegExp(
          `CREATE POLICY[^;]*ON\\s+public\\.${table}[^;]*is_school_member`,
          "i",
        );
        expect(sql).not.toMatch(memberPolicy);
        expect(sql).toMatch(
          new RegExp(`REVOKE ALL ON public\\.${table} FROM PUBLIC, anon, authenticated`),
        );
        expect(sql).toMatch(new RegExp(`ALTER TABLE public\\.${table} FORCE ROW LEVEL SECURITY`));
      });
    }

    it(`${path.split("/").pop()}: só usa funções de trigger que existem na base SGA`, () => {
      expect(sql).not.toMatch(/EXECUTE FUNCTION public\.set_updated_at\(\)/);
    });
  }

  it("a guarda de disciplinas não lê colunas que a produção não tem", () => {
    const sql = withoutComments(
      read("supabase/migrations/20260925162000_lesson_plans_and_subject_guards.sql"),
    );
    // `subjects.grade_from/grade_to` e `grade_levels.sort_order` só existem no
    // esquema Lovable; lidos directamente, cada escrita em class_subjects falhava.
    expect(sql).not.toMatch(/SELECT\s+grade_from,\s*grade_to/i);
    expect(sql).not.toMatch(/l\.sort_order/);
  });
});
