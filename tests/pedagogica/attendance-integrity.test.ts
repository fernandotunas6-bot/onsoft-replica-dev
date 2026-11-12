import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { absencePercentageFromStatuses } from "@/features/academic/exam-engine";
import { computeAttendanceRate } from "@/features/pedagogica/attendance-server";

const source = readFileSync("src/features/pedagogica/attendance-server.ts", "utf8");
const block = (name: string) => {
  const start = source.indexOf(`export const ${name} = createServerFn`);
  const next = source.indexOf("export const ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
};

describe("percentagem de faltas (exclusão por faltas)", () => {
  it("aluno não registado na chamada não conta como aula assistida", () => {
    // Antes: 1 falta em 4 registos = 25%; o aluno faltou à única aula em que foi marcado.
    expect(
      absencePercentageFromStatuses([
        "absent",
        "not_registered",
        "not_registered",
        "not_registered",
      ]),
    ).toBe(100);
    expect(absencePercentageFromStatuses(["not_registered"])).toBeNull();
  });

  it("justificadas continuam fora; atraso e saída antecipada contam como presença", () => {
    expect(absencePercentageFromStatuses(["absent", "excused", "late", "early_exit"])).toBe(33.33);
  });

  it("a taxa de assiduidade da ficha segue a mesma regra", () => {
    // Antes a saída antecipada era falta aqui (50%) e presença na pauta.
    expect(computeAttendanceRate([{ status: "present" }, { status: "early_exit" }])).toBe(100);
    expect(computeAttendanceRate([{ status: "absent" }, { status: "early_exit" }])).toBe(50);
  });
});

describe("chamada fechada só se corrige com motivo", () => {
  it("reenviar a chamada de uma sessão fechada é recusado antes de gravar", () => {
    const submit = block("submitAttendanceCallBatch");
    const guard = submit.indexOf('session.status === "completed"');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(submit.indexOf('from("siga_attendance_records")'));
  });
});

describe("anexo das justificações", () => {
  it("o anexo é verificado ao enviar e o nome é o do ficheiro", () => {
    const submit = block("submitAttendanceJustification");
    expect(submit).toContain("loadShareableSchoolFile(");
    expect(submit).toContain("file_name: attachment?.name ?? null");
    expect(submit).not.toContain("data.fileName");
  });

  it("quem decide abre o anexo, com a mesma regra da decisão", () => {
    const open = block("openAttendanceJustificationFile");
    expect(open).toContain("assertMayDecideJustification(");
    expect(open.indexOf("assertMayDecideJustification(")).toBeLessThan(
      open.indexOf("signChatAttachmentFile("),
    );
    expect(block("reviewAttendanceJustification")).toContain("assertMayDecideJustification(");
  });
});

describe("decisão das justificações", () => {
  const review = block("reviewAttendanceJustification");

  it("só uma decisão por justificação", () => {
    expect(review).toContain('just.status !== "pending"');
    // E a gravação só acontece se ainda estiver pendente (duas decisões ao mesmo tempo).
    const update = review.slice(review.indexOf(".update({\n        status: data.status"));
    expect(update.slice(0, 600)).toContain('.eq("status", "pending")');
    expect(review).toContain("if (!decided?.length)");
  });

  it("professor só decide as das suas aulas; Direcção e Secretaria decidem todas", () => {
    const helper = source.slice(source.indexOf("async function assertMayDecideJustification"));
    expect(helper).toMatch(/role === "Administrador" \|\| role === "Secretaria"/);
    expect(helper).toContain("teacherOwnsAttendanceSession");
    const check = review.indexOf("assertMayDecideJustification(");
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(review.indexOf(".update({\n        status: data.status"));
  });

  it("a falta justificada é procurada na escola de quem decide", () => {
    const excuse = review.slice(review.indexOf('status: "excused"'));
    expect(excuse.slice(0, 200)).toContain('.eq("school_id", membership.schoolId)');
  });
});
