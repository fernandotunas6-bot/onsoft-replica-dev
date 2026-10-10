import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { AcademicCatalog } from "../src/components/AcademicCatalog";
import { dueLabel, luandaClock, scheduleByDay, taskBuckets } from "../src/domain/agenda";
import type { AcademicCatalog as Catalog } from "../src/domain/catalog";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
// Sexta-feira, 9 de Outubro de 2026, 09:10 em Luanda (UTC+1).
const NOW = new Date("2026-10-09T08:10:00Z");
const slot = (n: number, weekday: number, startsAt: string, endsAt: string) => ({
  slotId: id(500 + n),
  classSubjectId: id(10),
  scheduleId: null,
  publication: "published" as const,
  validFrom: null,
  validTo: null,
  weekday,
  startsAt,
  endsAt,
  room: null,
});
const task = (n: number, due: string | null) => ({
  id: id(600 + n),
  classSubjectId: id(10),
  slotId: null,
  kind: "assignment",
  title: `Trabalho ${n}`,
  instructions: null,
  due,
});
const catalog = (role: "professor" | "aluno"): Catalog => ({
  schoolId: id(2),
  role,
  classes: [
    {
      classSubjectId: id(10),
      classGroupId: id(110),
      academicYearId: id(300),
      className: "10.ª A",
      subjectName: "Matemática",
      subjectId: id(210),
      teacher: { id: id(400), name: "Prof. Ana", userId: id(1) },
      students: [],
    },
  ],
  timetable: [
    slot(1, 1, "08:00", "08:45"),
    slot(2, 5, "10:00", "10:45"),
    slot(3, 5, "09:00", "09:45"),
    slot(4, 5, "08:00", "08:45"),
  ],
  tasks: [task(1, "2026-10-12"), task(2, null), task(3, "2026-10-09"), task(4, "2026-10-05")],
});
afterEach(cleanup);

describe("agenda", () => {
  it("lê a data, o dia e a hora de Luanda", () => {
    expect(luandaClock(NOW)).toEqual({ date: "2026-10-09", weekday: 5, clock: "09:10" });
    expect(luandaClock(new Date("2026-10-11T23:30:00Z")).weekday).toBe(1);
  });
  it("agrupa por dia a começar em hoje e marca a aula a decorrer e a seguinte", () => {
    const days = scheduleByDay(catalog("aluno").timetable, { weekday: 5, clock: "09:10" });
    expect(days.map((d) => d.label)).toEqual(["Hoje · Sexta-feira", "Segunda-feira"]);
    expect(days[0]!.slots.map((s) => [s.slot.startsAt, s.state])).toEqual([
      ["08:00", null],
      ["09:00", "now"],
      ["10:00", "next"],
    ]);
    expect(days[1]!.slots.every((s) => s.state === null)).toBe(true);
  });
  it("diz quanto falta para cada prazo", () => {
    const today = "2026-10-09";
    expect(
      ["2026-10-09", "2026-10-10", "2026-10-12", "2026-10-08", "2026-10-05"].map((d) =>
        dueLabel(d, today),
      ),
    ).toEqual(["Hoje", "Amanhã", "Faltam 3 dias", "Terminou ontem", "Terminou há 4 dias"]);
    expect(dueLabel(null, today)).toBeNull();
  });
  it("separa os trabalhos por entregar, do prazo mais próximo, dos já terminados", () => {
    const { open, closed } = taskBuckets(catalog("aluno").tasks, "2026-10-09");
    expect(open.map((t) => t.title)).toEqual(["Trabalho 3", "Trabalho 1", "Trabalho 2"]);
    expect(closed.map((t) => t.title)).toEqual(["Trabalho 4"]);
  });
});

describe("páginas de cada função", () => {
  const view = (role: "professor" | "aluno", module: string, onNavigate = vi.fn()) =>
    render(
      <AcademicCatalog catalog={catalog(role)} module={module} onNavigate={onNavigate} now={NOW} />,
    );
  it("o horário mostra hoje primeiro, com a aula a decorrer", () => {
    view("professor", "aulas");
    const today = screen.getByRole("region", { name: "Hoje · Sexta-feira" });
    expect(within(today).getByText("A decorrer")).toBeTruthy();
    expect(within(today).getByText("A seguir")).toBeTruthy();
    expect(screen.getAllByRole("region").map((r) => r.getAttribute("aria-label"))).toEqual([
      "Hoje · Sexta-feira",
      "Segunda-feira",
    ]);
  });
  it("os trabalhos aparecem por prazo", () => {
    view("aluno", "trabalhos");
    const open = screen.getByRole("region", { name: "Por entregar" });
    expect(
      within(open)
        .getAllByRole("heading", { level: 2 })
        .map((h) => h.textContent),
    ).toEqual(["Trabalho 3Hoje", "Trabalho 1Faltam 3 dias", "Trabalho 2"]);
    const closed = screen.getByRole("region", { name: "Prazo terminado" });
    expect(within(closed).getByText("Terminou há 4 dias")).toBeTruthy();
  });
  it("o professor chega à chamada e às notas a partir da turma", () => {
    const onNavigate = vi.fn();
    view("professor", "turmas", onNavigate);
    expect(screen.getByText("4 períodos por semana · 3 trabalhos por entregar")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Fazer chamada" }));
    fireEvent.click(screen.getByRole("button", { name: "Ver notas" }));
    expect(onNavigate.mock.calls).toEqual([["presencas"], ["notas"]]);
  });
  it("o aluno vê o professor e as notas, sem chamada", () => {
    const onNavigate = vi.fn();
    view("aluno", "disciplinas", onNavigate);
    expect(screen.getByText("Professor: Prof. Ana")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Fazer chamada" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ver notas" }));
    expect(onNavigate).toHaveBeenCalledWith("notas-aluno");
  });
});
