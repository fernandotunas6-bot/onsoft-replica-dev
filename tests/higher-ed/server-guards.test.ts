import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/features/higher-ed/server.ts", "utf8");
const fn = (name: string) => {
  const start = source.indexOf(`export const ${name}`);
  const next = source.indexOf("export const ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
};

describe("Ensino Superior no servidor", () => {
  it("todas as escritas exigem cargo de escrita", () => {
    for (const name of [
      "savePlanUnit",
      "removePlanUnit",
      "setUnitPrerequisites",
      "enrollStudentUnits",
      "cancelUnitEnrollment",
      "grantUnitExemption",
    ]) {
      expect(fn(name), name).toContain('officeMembership(context, "write")');
    }
    expect(fn("recordUnitResult")).toContain("requireSgaWriterForWrite(");
    expect(fn("saveHigherEdRegulation")).toContain('"Administrador",');
  });

  it("todas as consultas filtram pela escola da sessão", () => {
    const unfiltered: string[] = [];
    for (const match of source.matchAll(/\.from\("([a-z_]+)"\)/g)) {
      const end = source.indexOf(";", match.index);
      const chain = source.slice(match.index, end);
      // A própria escola filtra-se pelo id, que vem da sessão.
      const ownSchool = match[1] === "schools" && chain.includes('.eq("id", schoolId)');
      if (!chain.includes("school_id") && !ownSchool) unfiltered.push(match[1]!);
    }
    expect(unfiltered).toEqual([]);
  });

  it("precedências: ciclo recusado antes de gravar", () => {
    const body = fn("setUnitPrerequisites");
    expect(body.indexOf("findPrerequisiteCycles(")).toBeLessThan(body.indexOf(".delete()"));
  });

  it("inscrição: motor e regulamento validam antes de inserir; estudante tem de ser do curso", () => {
    const body = fn("enrollStudentUnits");
    expect(body).toContain("requireStudentInProgram(");
    expect(body.indexOf("checkEnrollmentBatch(")).toBeLessThan(body.indexOf(".insert("));
  });

  it("resultados: só professor da cadeira ou coordenação, época validada, auditoria", () => {
    const body = fn("recordUnitResult");
    expect(body).toContain("canLaunchUnit(");
    expect(body).toContain("seasonEligibility(");
    expect(body).toContain("Lance primeiro a frequência");
    expect(body).toContain("await audit(");
  });

  it("creditação exige 2FA e fica na auditoria", () => {
    const body = fn("grantUnitExemption");
    expect(body).toContain('requireAal2(context.claims, "Creditar uma cadeira")');
    expect(body).toContain('action: "higher_ed.unit.exempted"');
  });

  it("cadeira com inscrições não sai do plano", () => {
    expect(fn("removePlanUnit")).toContain("Esta cadeira já tem inscrições de estudantes.");
  });

  it("pauta da cadeira: professor só vê as cadeiras que dá", () => {
    const list = fn("listLaunchableUnits");
    expect(list).toContain("isOfficeRole(membership)");
    expect(list).toContain("teacherUnitKeys(");
    const sheet = fn("getUnitSheet");
    expect(sheet.indexOf("canLaunchUnit(")).toBeLessThan(
      sheet.indexOf('.from("course_unit_enrollments")'),
    );
    expect(sheet).toContain("seasonEligibility(");
  });

  it("lançamento com bloqueio optimista: não sobrepõe uma inscrição que mudou", () => {
    const body = fn("recordUnitResult");
    expect(body).toContain('.eq("status", latestRecord.status)');
    expect(body).toContain("Esta inscrição mudou entretanto");
  });

  it("histórico académico: só secretaria, estudante da escola", () => {
    const body = fn("getStudentTranscript");
    expect(body).toContain('officeMembership(context, "read")');
    expect(body).toContain("Estudante não encontrado nesta escola.");
    expect(body).toContain("transcriptLines(");
  });

  it("portal: estudante e encarregado só vêem o próprio percurso", () => {
    const body = fn("getMyHigherEd");
    expect(body).toContain("resolveVisibleStudent(context.userId, data.studentId)");
    expect(body).toContain("if (!visible) return { programs: [] };");
  });

  it("cursos: só o Administrador cria e altera; anos nunca se apagam", () => {
    for (const name of ["createHigherEdProgram", "updateHigherEdProgram"]) {
      expect(fn(name), name).toContain("adminMembership(context)");
      expect(fn(name), name).toContain("ensureProgramYears(");
    }
    expect(fn("createHigherEdProgram")).toContain("Já existe um curso com o código");
    expect(fn("updateHigherEdProgram")).toContain("Este curso não é do Ensino Superior.");
    expect(source).not.toMatch(/from\("grade_levels"\)\s*\.delete\(/);
  });

  it("inscrição em lote: secretaria, estudantes do curso, mesmas regras", () => {
    const body = fn("enrollCohort");
    expect(body).toContain('officeMembership(context, "write")');
    expect(body).toContain("programStudentIds(");
    expect(body.indexOf("planCohortEnrollment(")).toBeLessThan(body.indexOf(".insert(inserts"));
    expect(body).toContain('action: "higher_ed.cohort.enrolled"');
  });

  it("inscrições sem resultado de anos anteriores: só leitura da secretaria", () => {
    const body = fn("listStalePendingEnrollments");
    expect(body).toContain('officeMembership(context, "read")');
    expect(body).toContain('.neq("academic_year_id", yearId)');
  });

  it("regulamento: bloqueio por versão e auditoria", () => {
    const body = fn("saveHigherEdRegulation");
    expect(body).toContain('.eq("version", existing.version)');
    expect(body).toContain('action: "higher_ed.regulation.saved"');
  });
});
