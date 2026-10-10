import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Context, Gateway } from "../src/domain/model";
import type { AcademicCatalog } from "../src/domain/catalog";
import type { AcademicGradebooks } from "../src/domain/gradebooks";
import { parseAcademicGradebooks } from "../src/domain/gradebooks";
import { InstitutionalGradebooks } from "../src/components/InstitutionalGradebooks";
import { ApiGateway } from "../src/services/api";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ctx: Context = { schoolId: id(1), userId: id(2), role: "professor" };
const catalog: AcademicCatalog = {
  schoolId: ctx.schoolId,
  role: ctx.role,
  classes: [
    {
      classSubjectId: id(3),
      classGroupId: id(4),
      academicYearId: id(5),
      className: "Turma A",
      subjectId: id(6),
      subjectName: "Matemática",
      teacher: { id: id(7), name: "Professor", userId: ctx.userId },
      students: [
        { studentId: id(8), enrollmentId: id(9), name: "Aluno Zero", userId: null },
        { studentId: id(10), enrollmentId: id(11), name: "Aluno sem nota", userId: null },
      ],
    },
  ],
  timetable: [],
  tasks: [],
};
const data = (): AcademicGradebooks => ({
  schoolId: ctx.schoolId,
  role: "professor",
  books: [
    {
      id: id(12),
      classSubjectId: id(3),
      term: { id: id(13), name: "1º Período", sequence: 1 },
      status: "open",
      items: [
        {
          id: id(14),
          code: "MAC",
          name: "Avaliação contínua",
          kind: "continuous",
          maxScore: 100,
          sequence: 1,
          assessedOn: null,
          scores: [{ enrollmentId: id(9), value: 0, status: "draft" }],
        },
      ],
    },
  ],
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("preserves the institution's component scale and real zero", () => {
  expect(parseAcademicGradebooks(data(), ctx, catalog).books[0].items[0].maxScore).toBe(100);
});
it.each([
  "school",
  "role",
  "teacher",
  "class",
  "peer",
  "score",
  "duplicate",
  "item",
  "extra",
  "status",
  "date",
  "term",
  "pair",
  "max",
  "infinity",
  "code",
])("rejects %s leakage or inconsistency", (kind) => {
  const d = data(),
    b = d.books[0],
    i = b.items[0],
    s = i.scores[0];
  let c = catalog;
  if (kind === "school") d.schoolId = id(99);
  if (kind === "role") Object.assign(d, { role: "aluno" });
  if (kind === "teacher")
    c = {
      ...catalog,
      classes: [
        { ...catalog.classes[0], teacher: { ...catalog.classes[0].teacher!, userId: id(99) } },
      ],
    };
  if (kind === "class") b.classSubjectId = id(99);
  if (kind === "peer") s.enrollmentId = id(99);
  if (kind === "score") s.value = 101;
  if (kind === "duplicate") i.scores.push(s);
  if (kind === "item") b.items.push(i);
  if (kind === "extra") Object.assign(s, { note: "Private" });
  if (kind === "status") Object.assign(s, { status: "published" });
  if (kind === "date") i.assessedOn = "2026-02-31";
  if (kind === "term") b.term.sequence = 0;
  if (kind === "pair") d.books.push({ ...b, id: id(99) });
  if (kind === "max") i.maxScore = 0;
  if (kind === "infinity") s.value = Infinity;
  if (kind === "code") i.code = "bad code";
  expect(() => parseAcademicGradebooks(d, ctx, c)).toThrow("Contrato de diários");
});
it("consults component scores, missing records, search, filter and refresh", async () => {
  const read = vi
    .fn()
    .mockResolvedValueOnce(data())
    .mockResolvedValueOnce({ ...data(), books: [] });
  const gateway = { academicGradebooks: read } as unknown as Gateway;
  render(<InstitutionalGradebooks ctx={ctx} catalog={catalog} gateway={gateway} />);
  await screen.findByRole("heading", { name: "Matemática · 1º Período" });
  fireEvent.click(screen.getByText("MAC · Avaliação contínua · Máximo 100"));
  expect(screen.getByText(/0 \/ 100 · Rascunho/)).toBeTruthy();
  expect(screen.getByText(/Sem nota registada/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Pesquisar aluno"), { target: { value: "Zero" } });
  expect(screen.queryByText("Aluno sem nota")).toBeNull();
  fireEvent.change(screen.getByLabelText("Período"), { target: { value: id(13) } });
  fireEvent.click(screen.getByRole("button", { name: "Actualizar diários" }));
  await screen.findByText("Sem diários para os filtros seleccionados.");
  expect(read).toHaveBeenCalledTimes(2);
});
it("refuses the student role without requesting draft grades", async () => {
  const fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      userId: ctx.userId,
      name: "Aluno",
      memberships: [
        {
          schoolId: ctx.schoolId,
          schoolName: "Escola",
          active: true,
          roles: ["aluno"],
          permissions: ["academic.read"],
        },
      ],
    }),
  });
  vi.stubGlobal("fetch", fetch);
  const api = new ApiGateway();
  await api.session();
  await expect(
    api.academicGradebooks({ ...ctx, role: "aluno" }, { ...catalog, role: "aluno" }),
  ).rejects.toThrow("exclusiva do professor");
  expect(fetch).toHaveBeenCalledTimes(1);
});
