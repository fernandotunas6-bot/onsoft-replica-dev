import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Escritas em lote: sem atalhos às regras do caminho individual, sem uma ida à
// base por linha e sem erros ignorados.

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const body = (source: string, name: string) => {
  const start = source.indexOf(`export const ${name} `);
  expect(start, `${name} não encontrado`).toBeGreaterThan(-1);
  const next = source.indexOf("export const ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
};

describe("atribuir turma em lote (alunos)", () => {
  const fn = body(read("src/features/students/server.ts"), "batchAssignClass");

  it("matrículas novas passam por enroll_student (2FA, capacidade, número)", () => {
    expect(fn).toMatch(/rpc\("enroll_student"/);
    expect(fn).not.toMatch(/from\("enrollments"\)\s*\.insert\(/);
  });

  it("confirma que a turma é do ano lectivo pedido e verifica a lotação", () => {
    expect(fn).toMatch(/academic_year_id\) !== data\.academicYearId/);
    expect(fn).toMatch(/count: "exact", head: true/);
  });

  it("só reutiliza matrículas correntes (não reactiva transferidas ou concluídas)", () => {
    expect(fn).toMatch(/\.in\("status", \["pending", "active"\]\)/);
  });
});

describe("chamada de presença", () => {
  const source = read("src/features/pedagogica/attendance-server.ts");

  for (const name of ["submitAttendanceCallBatch", "editFinalizedAttendanceCall"]) {
    it(`${name}: um upsert para a turma, com erro verificado`, () => {
      const fn = body(source, name);
      expect(fn).not.toMatch(/for \(const item of data\.records\)/);
      expect(fn).toMatch(/error: upsertError/);
      expect(fn).toMatch(/recomputeAttendanceRates\(/);
    });
  }

  it("a taxa é recalculada na base, de uma vez", () => {
    expect(source).toMatch(/rpc\("siga_recompute_attendance_rates"/);
  });
});

describe("pauta: pré-pauta obrigatória", () => {
  const source = read("src/features/academic/grade-sheets.ts");

  it("submeter e homologar recalculam a pré-pauta no servidor e recusam pendências", () => {
    const fn = body(source, "transitionGradeSheet");
    expect(fn).toMatch(/PRE_PAUTA_GATED_STATUSES\.includes\(data\.status\)/);
    expect(fn).toMatch(/loadPrePauta\(/);
    expect(fn.indexOf("loadPrePauta(")).toBeLessThan(fn.indexOf('rpc("transition_grade_sheet"'));
  });

  it("a data de geração vem das linhas da pauta, não do updated_at", () => {
    expect(source).toMatch(/from\("grade_sheet_rows"\)[\s\S]{0,120}\.select\("created_at"\)/);
  });
});

describe("pedidos de acesso: a escola é avisada", () => {
  const source = read("src/features/access/requests-server.ts");

  it("submeter avisa no portal a Administração e a Secretaria, além do e-mail", () => {
    const fn = body(source, "submitAccessRequest");
    expect(fn).toMatch(/notifyReviewers\(db, data\.schoolId/);
    expect(source).toMatch(
      /REVIEWER_ROLE_CODES = \["owner", "admin", "administrador", "secretary", "secretaria"\]/,
    );
  });

  it("a resposta do requerente também avisa a Administração e a Secretaria", () => {
    expect(body(source, "actOnMyAccessRequest")).toMatch(/notifyReviewers\(db, request\.school_id/);
  });

  it("aprovar avisa o requerente no portal", () => {
    expect(body(source, "reviewAccessRequest")).toMatch(/access_request\.approved/);
  });
});

describe("histórico académico: registar a pauta anual", () => {
  const fn = body(read("src/features/academic/final-results.ts"), "recordClassFinalResults");

  it("rectificações numa só escrita, mantendo o autor original", () => {
    expect(fn).not.toMatch(/for \(const r of rows[^\n]*\)[\s\S]{0,1500}\.update\(/);
    expect(fn).toMatch(/\.upsert\(updates, \{ onConflict: "id" \}\)/);
    expect(fn).toMatch(/created_by: before\.created_by/);
  });

  it("média da matrícula: só as que mudam, com erro verificado", () => {
    expect(fn).not.toMatch(/for \(const l of lines\)/);
    expect(fn).toMatch(/\.in\("id", ids\)/);
    expect(fn).toMatch(/Não foi possível gravar a média final na matrícula/);
  });
});

describe("notas de exame", () => {
  const fn = body(read("src/features/academic/exams.ts"), "saveExamScores");

  it("valida todas as notas antes de escrever e grava numa só escrita", () => {
    expect(fn).toMatch(/\.upsert\(rows, \{ onConflict: "id" \}\)/);
    expect(fn.indexOf("A nota do exame fica entre")).toBeLessThan(fn.indexOf(".upsert("));
    expect(fn).not.toMatch(/for \(const entry of data\.entries\)/);
  });
});

describe("aulas do dia (presença)", () => {
  const fn = body(
    read("src/features/pedagogica/attendance-server.ts"),
    "listTeacherAttendanceSessions",
  );

  it("só o corpo docente: aluno e encarregado não vêem nem criam sessões", () => {
    expect(fn).not.toMatch(/resolveSgaMembershipAdmin\(/);
    expect(fn).toMatch(
      /requireSgaWriterFor\("pedagogica"[\s\S]{0,120}"Administrador",\s*"Secretaria",\s*"Professor"/,
    );
  });

  it("professor sem ficha de docente não vê as aulas da escola inteira", () => {
    expect(fn).toMatch(/if \(!linked\.teacher_id\) return \{ sessions: \[\]/);
  });

  it("as sessões em falta criam-se numa só escrita, com erro verificado", () => {
    const loop = fn.slice(fn.indexOf("for (const slot of slots"));
    expect(loop).not.toMatch(/\.insert\(/);
    expect(fn).toMatch(/error: createError/);
  });
});
