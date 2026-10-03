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
      if (!chain.includes("school_id")) unfiltered.push(match[1]!);
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
});
