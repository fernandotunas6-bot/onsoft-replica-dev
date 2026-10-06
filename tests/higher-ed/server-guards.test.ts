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
    const start = source.indexOf("async function enrollUnitsFor");
    const body = source.slice(start, source.indexOf("export const ", start));
    expect(body).toContain("requireStudentInProgram(");
    expect(body).toContain("assertEnrollmentAllowed(");
    expect(body.indexOf("checkEnrollmentBatch(")).toBeLessThan(body.indexOf(".insert("));
    expect(fn("enrollStudentUnits")).toContain("enrollUnitsFor(db");
  });

  it("matrícula on-line: só o próprio estudante, só com o regulamento aberto, auditada", () => {
    const own = source.slice(
      source.indexOf("async function ownStudent"),
      source.indexOf("async function enrolledProgramsOf"),
    );
    expect(own).toContain('appRole !== "Aluno"');
    const body = fn("enrollMyUnits");
    expect(body).toContain("ownStudent(context.userId)");
    expect(body).not.toContain("studentId: z.");
    expect(body.indexOf("regulation.student_self_enrollment")).toBeLessThan(
      body.indexOf("enrollUnitsFor(db"),
    );
    expect(body).toContain('action: "higher_ed.enrollment.self"');
    expect(fn("getMyEnrollmentOffer")).toContain("regulation.student_self_enrollment");
  });

  it("turnos: só a coordenação muda o turno, para uma turma que dá a cadeira, com auditoria", () => {
    const body = fn("setUnitShift");
    expect(body).toContain('officeMembership(context, "write")');
    expect(body).toContain("Essa turma não dá esta cadeira");
    expect(body).toContain("await audit(");
  });

  it("resultados: só professor da cadeira ou coordenação, época validada, auditoria", () => {
    const body = fn("recordUnitResult");
    expect(body).toContain("launchScope(");
    expect(body).toContain("canLaunchAny(scope)");
    // Turnos: o professor só lança os estudantes dos seus turnos (ou sem turno).
    expect(body).toContain("shiftVisible(scope, latestRow.shift)");
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
    expect(sheet.indexOf("canLaunchAny(scope)")).toBeLessThan(
      sheet.indexOf('.from("course_unit_enrollments")'),
    );
    expect(sheet).toContain("shiftVisible(scope, row.shift)");
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
    expect(body).toContain("buildTranscript(db, membership.schoolId, data)");
    const build = source.slice(
      source.indexOf("async function buildTranscript"),
      source.indexOf("export const getStudentTranscript"),
    );
    expect(build).toContain("Estudante não encontrado nesta escola.");
    expect(build).toContain("transcriptLines(");
  });

  it("trabalhador-estudante: secretaria com 2FA, auditado, e a base sem a tabela não parte nada", () => {
    const status = readFileSync("src/features/higher-ed/student-status.ts", "utf8");
    const chunk = (name: string) => {
      const start = status.indexOf(`export const ${name}`);
      const next = status.indexOf("export const ", start + 1);
      return status.slice(start, next === -1 ? undefined : next);
    };
    for (const [name, label, action] of [
      [
        "grantWorkerStudentStatus",
        "Conceder o estatuto de trabalhador-estudante",
        "student.special_status.granted",
      ],
      [
        "revokeStudentSpecialStatus",
        "Revogar um estatuto do estudante",
        "student.special_status.revoked",
      ],
    ] as const) {
      const body = chunk(name);
      expect(body, name).toContain(`requireAal2(context.claims, "${label}")`);
      expect(body, name).toContain("[...OFFICE]");
      expect(body, name).toContain(`action: "${action}"`);
      expect(body, name).toContain("missingTable(error)");
    }
    expect(status).toContain('const OFFICE = ["Administrador", "Secretaria"] as const;');
    // Ler o estatuto com a tabela por criar devolve «sem estatuto», não um erro.
    const map = status.slice(status.indexOf("export async function studentStatusMap"));
    expect(map).toContain("if (missingTable(error)) return map;");
    // O lançamento e a pauta aplicam o estatuto do estudante.
    expect(fn("recordUnitResult")).toContain(
      "frequencyOutcome(data.frequency, data.absencePercent, regulation, status)",
    );
    expect(fn("getUnitSheet")).toContain("studentStatusMap(db, schoolId, studentIds)");
  });

  it("certificado de conclusão: secretaria com 2FA, só concluído, número e código, uma vez", () => {
    const body = fn("issueHigherEdCertificate");
    expect(body).toContain('officeMembership(context, "write")');
    expect(body).toContain('requireAal2(context.claims, "Emitir o certificado de conclusão")');
    expect(body).toContain("if (transcript.certificate) return transcript.certificate;");
    expect(body).toContain("O estudante ainda não concluiu o curso");
    // Número da série oficial de certificados e código do registo de /verificar.
    expect(body).toMatch(
      /rpc\("next_document_number_service", \{[^}]*document_type: "certificate"/,
    );
    expect(body).toContain("generateVerificationCode()");
    expect(body).toContain("action: ISSUED_DOCUMENT_ACTION");
    expect(body).toContain("template: HIGHER_ED_CERTIFICATE_TEMPLATE");
    // Sem registo, o documento diria que é verificável e não é.
    expect(body).toMatch(
      /if \(error\) throw publicDatabaseError\(error, "Não foi possível registar/,
    );
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

  it("emolumentos: tesouraria/administração gravam, auditado, só códigos do catálogo", () => {
    const body = fn("saveHigherEdFees");
    expect(body).toContain('requireSgaWriterForWrite(\n      "financeiro"');
    expect(body).toContain('action: "higher_ed.fees.saved"');
    expect(body).toContain('kind: "service"');
    expect(fn("getHigherEdFees")).toContain('requireSgaWriterFor("financeiro"');
  });

  it("correcção de nota: secretaria, 2FA, motivo, bloqueio optimista e auditoria", () => {
    const body = fn("correctUnitResult");
    expect(body).toContain('officeMembership(context, "write")');
    expect(body).toContain('requireAal2(context.claims, "Corrigir uma nota lançada")');
    expect(body).toContain('.eq("status", status)');
    expect(body).toContain('action: "higher_ed.result.corrected"');
  });

  it("acesso: seriação só leitura da secretaria; nota com versão e auditoria", () => {
    expect(fn("getAccessRanking")).toContain('officeMembership(context, "read")');
    const body = fn("setApplicationAccessScore");
    expect(body).toContain('officeMembership(context, "write")');
    expect(body).toContain('.eq("version", version)');
    expect(body).toContain('action: "higher_ed.access.score"');
  });

  it("regras opcionais: inscrições verificam período e dívida; anulação tardia exige 2FA", () => {
    // Individual e matrícula on-line passam por enrollUnitsFor (ver acima).
    expect(fn("enrollStudentUnits")).toContain("enrollUnitsFor(db");
    expect(fn("enrollMyUnits")).toContain("enrollUnitsFor(db");
    expect(fn("enrollCohort")).toContain("assertEnrollmentAllowed(");
    expect(fn("cancelUnitEnrollment")).toContain(
      'requireAal2(context.claims, "Anular uma inscrição fora do prazo")',
    );
  });

  it("exportação SISIES: secretaria, ano activo, auditada", () => {
    const body = fn("exportSisiesWorkbook");
    expect(body).toContain('officeMembership(context, "read")');
    for (const sheet of ["Vagas", "Acesso", "Matrículas", "Graduados"]) {
      expect(body).toContain(`addWorksheet("${sheet}")`);
    }
    expect(body).toContain('action: "higher_ed.sisies.exported"');
  });

  it("decisão do júri: só doutoramento, 2FA, inscrição em curso, auditoria", () => {
    const body = fn("recordDoctoralDecision");
    expect(body).toContain('requireAal2(context.claims, "Registar a decisão do júri")');
    expect(body).toContain("A decisão do júri só se regista em cursos de doutoramento.");
    expect(body).toContain('.eq("status", "inscrito")');
    expect(body).toContain('action: "higher_ed.doctoral.decision"');
  });
});
