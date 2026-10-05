import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { absencePercentageFromStatuses } from "@/features/academic/exam-engine";

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
});

describe("chamada fechada só se corrige com motivo", () => {
  it("reenviar a chamada de uma sessão fechada é recusado antes de gravar", () => {
    const submit = block("submitAttendanceCallBatch");
    const guard = submit.indexOf('session.status === "completed"');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(submit.indexOf('from("siga_attendance_records")'));
  });
});

describe("decisão das justificações", () => {
  const review = block("reviewAttendanceJustification");

  it("só uma decisão por justificação", () => {
    expect(review).toContain('just.status !== "pending"');
  });

  it("professor só decide as das suas aulas; Direcção e Secretaria decidem todas", () => {
    expect(review).toMatch(/role === "Administrador" \|\| role === "Secretaria"/);
    const check = review.indexOf("teacherOwnsAttendanceSession");
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(review.indexOf(".update({\n        status: data.status"));
  });

  it("a falta justificada é procurada na escola de quem decide", () => {
    const excuse = review.slice(review.indexOf('status: "excused"'));
    expect(excuse.slice(0, 200)).toContain('.eq("school_id", membership.schoolId)');
  });
});
