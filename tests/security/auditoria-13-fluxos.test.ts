import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Auditoria 13 (2026-10-06) — fluxos da escola, de ponta a ponta.
 * Ver docs/auditoria/13-auditoria-fluxos-2026-10-06.md.
 */
const read = (path: string) => readFileSync(path, "utf8");
const fnBody = (source: string, name: string) => {
  const start = source.indexOf(`export const ${name}`);
  expect(start, `${name} não encontrada`).toBeGreaterThan(-1);
  const next = source.indexOf("export const", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
};

describe("matrícula pública só para escolas que podem trabalhar", () => {
  const source = read("src/features/enrollment/server.ts");

  it("abrir e submeter o formulário verificam o estado do tenant", () => {
    for (const name of ["getPublicEnrollmentForm", "submitPublicEnrollment"]) {
      const body = fnBody(source, name);
      expect(body).toContain("schoolAcceptsPublicEnrollment(db");
    }
    expect(source).toContain("getTenantAccessBlock(");
  });

  it("aceitar uma candidatura conta para o limite de alunos do plano", () => {
    const body = fnBody(source, "decideEnrollmentApplication");
    const limit = body.indexOf("assertCanAddStudentForSchool(");
    expect(limit).toBeGreaterThan(-1);
    // Antes de criar a pessoa.
    expect(limit).toBeLessThan(body.indexOf('.from("people")'));
  });
});

describe("colocar um aluno em turma", () => {
  it("só procura a matrícula corrente do ano", () => {
    const body = fnBody(read("src/features/students/server.ts"), "enrollStudentInClass");
    const lookup = body.slice(0, body.indexOf(".maybeSingle()"));
    expect(lookup).toContain('.in("status", ["pending", "active"])');
  });
});

describe("notas e cotação da avaliação", () => {
  const legacy = read("src/features/academic/server-legacy.ts");

  it("nenhuma nota passa a cotação da avaliação", () => {
    // Núcleo partilhado pelo portal (upsertAssessmentScores) e pela app móvel.
    expect(fnBody(legacy, "upsertAssessmentScores")).toContain("recordAssessmentScores(");
    const core = read("src/features/academic/assessment-scores-core.server.ts");
    const body = core.slice(core.indexOf("export async function recordAssessmentScores("));
    expect(body).toContain('.select("id, term, class_group_id, max_score")');
    expect(body.indexOf("row.score > maxScore")).toBeLessThan(
      body.indexOf('from("siga_assessment_scores")'),
    );
  });

  it("a cotação não desce abaixo das notas já lançadas", () => {
    const body = fnBody(legacy, "updateAssessmentItem");
    expect(body.indexOf("topScore")).toBeGreaterThan(-1);
    expect(body.indexOf("topScore")).toBeLessThan(body.indexOf(".update({"));
  });
});

describe("importação", () => {
  const server = read("src/features/import/server.ts");

  it("o limite de alunos do plano chega ao importador", () => {
    expect(fnBody(server, "commitImportBatch")).toContain(
      "assertCanAddStudent: () => assertCanAddStudentForSchool(membership.schoolId)",
    );
  });

  it("uma linha que lança não leva o registo de reversão das anteriores", () => {
    const body = fnBody(server, "commitImportBatch");
    const flush = body.indexOf("flushAuditsOnFailure(");
    expect(flush).toBeGreaterThan(-1);
    expect(body.slice(flush)).toContain('from("import_audits").insert');
  });
});
