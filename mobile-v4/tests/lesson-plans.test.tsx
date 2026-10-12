import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { InstitutionalLessonPlans } from "../src/components/InstitutionalLessonPlans";
import { parseAcademicLessonPlans, type AcademicLessonPlans } from "../src/domain/lesson-plans";
import type { AcademicCatalog } from "../src/domain/catalog";
import type { Context, Gateway } from "../src/domain/model";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ctx: Context = { userId: id(1), schoolId: id(2), role: "professor" };
const klass = (cs: number, teacherUser = ctx.userId) => ({
  classSubjectId: id(cs),
  classGroupId: id(cs + 100),
  academicYearId: id(300),
  className: `10.ª ${cs}`,
  subjectName: `Disciplina ${cs}`,
  subjectId: id(cs + 200),
  teacher: { id: id(400), name: "Prof", userId: teacherUser },
  students: [],
});
const catalog: AcademicCatalog = {
  schoolId: ctx.schoolId,
  role: "professor",
  classes: [klass(10), klass(11), klass(12, id(9))],
  timetable: [],
  tasks: [],
};
const planRow = (n: number, extra: Partial<AcademicLessonPlans["plans"][number]> = {}) => ({
  id: id(n),
  classSubjectId: id(10),
  term: 1 as const,
  title: `Plano ${n}`,
  content: "Objectivos:\n- frações",
  fileName: null,
  status: "published" as const,
  updatedAt: "2026-10-08T10:00:00.123456+00:00",
  components: [
    { kind: "avaliacao" as const, name: "MAC", plannedCount: 2 },
    { kind: "prova" as const, name: "Prova 1", plannedCount: 1 },
  ],
  ...extra,
});
const data = (
  plans = [planRow(20), planRow(21, { classSubjectId: id(11), term: 2, status: "draft" })],
) => ({
  schoolId: ctx.schoolId,
  role: "professor" as const,
  plans,
});
afterEach(cleanup);

describe("contrato dos planos de aula", () => {
  it("aceita só planos das disciplinas do próprio professor", () => {
    expect(parseAcademicLessonPlans(data(), ctx, catalog).plans).toHaveLength(2);
    for (const bad of [
      data([planRow(20, { classSubjectId: id(12) })]),
      data([planRow(20, { classSubjectId: id(99) })]),
      data([planRow(20, { term: 4 as never })]),
      data([planRow(20, { status: "archived" as never })]),
      data([planRow(20, { title: "  " })]),
      data([planRow(20), planRow(20)]),
      data([{ ...planRow(20), extra: 1 } as never]),
      data([planRow(20, { components: [{ kind: "exame" as never, name: "x", plannedCount: 1 }] })]),
      { ...data(), role: "aluno" },
    ])
      expect(() => parseAcademicLessonPlans(bad, ctx, catalog)).toThrow();
    expect(() => parseAcademicLessonPlans(data(), { ...ctx, role: "aluno" }, catalog)).toThrow();
  });
});

describe("página dos planos de aula", () => {
  const gateway = (academicLessonPlans: Gateway["academicLessonPlans"]): Gateway => ({
    session: async () => null,
    workspace: async () => {
      throw Error("unused");
    },
    execute: async () => {},
    signOut: async () => {},
    academicLessonPlans,
  });
  it("mostra cada plano com estado, trimestre e avaliações previstas, e filtra", async () => {
    render(
      <InstitutionalLessonPlans
        ctx={ctx}
        catalog={catalog}
        gateway={gateway(vi.fn().mockResolvedValue(data()))}
      />,
    );
    await screen.findByText("Plano 20");
    expect(screen.getByText("10.ª 10 · Disciplina 10 · 1.º trimestre")).toBeTruthy();
    expect(screen.getAllByText(/Prevê 2 avaliações e 1 prova: MAC, Prova 1\./)).toHaveLength(2);
    expect(screen.getByText("Rascunho")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Trimestre"), { target: { value: "2" } });
    expect(screen.queryByText("Plano 20")).toBeNull();
    expect(screen.getByText("Plano 21")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Pesquisar no plano"), { target: { value: "nada" } });
    expect(screen.getByRole("status").textContent).toMatch(/Sem planos para os filtros/);
    // Só disciplinas dele no filtro.
    expect(screen.queryByRole("option", { name: "10.ª 12 · Disciplina 12" })).toBeNull();
  });
  it("diz quando ainda não há planos e mostra o erro sem inventar", async () => {
    render(
      <InstitutionalLessonPlans
        ctx={ctx}
        catalog={catalog}
        gateway={gateway(vi.fn().mockResolvedValue(data([])))}
      />,
    );
    expect(
      await screen.findByText(/Ainda não há planos de aula para as suas disciplinas/),
    ).toBeTruthy();
    cleanup();
    render(
      <InstitutionalLessonPlans
        ctx={ctx}
        catalog={catalog}
        gateway={gateway(vi.fn().mockRejectedValue(new Error("Falhou.")))}
      />,
    );
    expect((await screen.findByRole("alert")).textContent).toBe("Falhou.");
  });
});
