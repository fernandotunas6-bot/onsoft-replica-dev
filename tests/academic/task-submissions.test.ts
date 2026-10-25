import { describe, expect, it } from "vitest";
import {
  decideSubmission,
  isLate,
  latestByEnrollment,
  studentView,
  summarizeWork,
  taskState,
  type SubmissionRow,
} from "@/features/academic/task-submissions";

const row = (extra: Partial<SubmissionRow>): SubmissionRow => ({
  id: "x",
  enrollment_id: "e1",
  attempt: 1,
  status: "submitted",
  submitted_at: "2026-11-01T10:00:00Z",
  is_late: false,
  on_paper: false,
  body: "texto",
  grade: 14,
  feedback: "Bom",
  returned_at: null,
  ...extra,
});

const base = { taskStatus: "published", dueOn: "2026-11-01", acceptsLate: true, latest: null };

describe("prazo em Luanda", () => {
  it("o próprio dia ainda conta, até à meia-noite de Luanda", () => {
    expect(isLate("2026-11-01", "2026-11-01T22:59:00Z")).toBe(false);
    expect(isLate("2026-11-01", "2026-11-01T23:00:00Z")).toBe(true);
  });
  it("sem prazo nunca é atraso", () => {
    expect(isLate(null, "2030-01-01T00:00:00Z")).toBe(false);
  });
});

describe("pode entregar?", () => {
  it("primeira entrega é a tentativa 1; reenviar é a seguinte", () => {
    expect(decideSubmission({ ...base, now: "2026-10-30T10:00:00Z" })).toEqual({
      ok: true,
      attempt: 1,
      late: false,
    });
    expect(
      decideSubmission({ ...base, latest: row({ attempt: 2 }), now: "2026-10-30T10:00:00Z" }),
    ).toMatchObject({ ok: true, attempt: 3 });
  });

  it("depois de devolvida, já não se reenvia", () => {
    expect(
      decideSubmission({
        ...base,
        latest: row({ status: "returned", returned_at: "2026-11-02T10:00:00Z" }),
        now: "2026-11-03T10:00:00Z",
      }),
    ).toEqual({ ok: false, reason: "O professor já devolveu esta entrega." });
  });

  it("atrasada: aceite e marcada, ou recusada se a tarefa não aceita", () => {
    expect(decideSubmission({ ...base, now: "2026-11-05T10:00:00Z" })).toMatchObject({
      ok: true,
      late: true,
    });
    expect(decideSubmission({ ...base, acceptsLate: false, now: "2026-11-05T10:00:00Z" })).toEqual({
      ok: false,
      reason: "O prazo terminou e esta tarefa não aceita entregas atrasadas.",
    });
  });

  it("tarefa arquivada não aceita entregas", () => {
    expect(
      decideSubmission({ ...base, taskStatus: "archived", now: "2026-10-30T10:00:00Z" }),
    ).toMatchObject({ ok: false });
  });
});

describe("o que se mostra", () => {
  it("a tentativa mais recente de cada aluno", () => {
    const latest = latestByEnrollment([
      row({ id: "a", attempt: 1 }),
      row({ id: "b", attempt: 2 }),
      row({ id: "c", enrollment_id: "e2" }),
    ]);
    expect([...latest.values()].map((r) => r.id)).toEqual(["b", "c"]);
  });

  it("o aluno só vê a nota e o comentário depois de devolvida", () => {
    expect(studentView(row({}))).toMatchObject({ grade: null, feedback: null });
    expect(
      studentView(row({ status: "returned", returned_at: "2026-11-02T10:00:00Z" })),
    ).toMatchObject({ grade: 14, feedback: "Bom" });
    expect(studentView(null)).toBeNull();
  });
});

describe("estado de um trabalho para o aluno", () => {
  const base = {
    taskStatus: "published",
    dueOn: "2026-11-01",
    acceptsLate: true,
    today: "2026-10-30",
  };

  it("por entregar dentro do prazo, atrasado depois, perdido quando já não aceita", () => {
    expect(taskState({ ...base, latest: null })).toBe("open");
    expect(taskState({ ...base, latest: null, today: "2026-11-01" })).toBe("open");
    expect(taskState({ ...base, latest: null, today: "2026-11-02" })).toBe("overdue");
    expect(taskState({ ...base, acceptsLate: false, latest: null, today: "2026-11-02" })).toBe(
      "missed",
    );
    expect(taskState({ ...base, taskStatus: "archived", latest: null })).toBe("missed");
    expect(taskState({ ...base, dueOn: null, latest: null, today: "2099-01-01" })).toBe("open");
  });

  it("a entrega manda: entregue ou devolvido, mesmo arquivado ou fora do prazo", () => {
    expect(taskState({ ...base, latest: { status: "submitted" }, today: "2026-12-01" })).toBe(
      "submitted",
    );
    expect(taskState({ ...base, taskStatus: "archived", latest: { status: "returned" } })).toBe(
      "returned",
    );
  });
});

describe("resumo das entregas", () => {
  it("conta entregues, devolvidas e atrasos; a média só com notas devolvidas", () => {
    expect(
      summarizeWork(4, [
        { status: "returned", is_late: false, grade: 14 },
        { status: "returned", is_late: true, grade: 9.5 },
        { status: "submitted", is_late: false, grade: 18 },
        null,
      ]),
    ).toEqual({ total: 4, delivered: 3, returned: 2, late: 1, average: 11.8 });
    expect(summarizeWork(2, [null, null]).average).toBeNull();
  });
});
