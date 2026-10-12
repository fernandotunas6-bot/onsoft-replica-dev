import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Context, Gateway } from "../src/domain/model";
import type { AcademicCatalog } from "../src/domain/catalog";
import type { AcademicResults } from "../src/domain/results";
import { parseAcademicResults } from "../src/domain/results";
import { InstitutionalResults } from "../src/components/InstitutionalResults";
import { ApiGateway, ApiError } from "../src/services/api";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ctx: Context = { schoolId: id(1), userId: id(2), role: "aluno" };
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
      teacher: null,
      students: [{ studentId: id(7), enrollmentId: id(8), userId: ctx.userId, name: "Aluno" }],
    },
  ],
  timetable: [],
  tasks: [],
};
const data = (): AcademicResults => ({
  schoolId: ctx.schoolId,
  role: "aluno",
  sheets: [
    {
      id: id(9),
      classGroupId: id(4),
      academicYearId: id(5),
      enrollmentId: id(8),
      title: "Pauta publicada",
      kind: "term",
      publishedAt: "2026-10-01T12:00:00+00:00",
      continuousAverage: 0,
      examAverage: null,
      termAverage: 12.5,
      result: "pass",
    },
  ],
});
const gateway = (fn = vi.fn().mockResolvedValue(data())) =>
  ({ academicResults: fn }) as unknown as Gateway;
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("preserves a real zero, null and institutional decimal without assuming a scale", () => {
  const r = parseAcademicResults(data(), ctx, catalog);
  expect(r.sheets[0].continuousAverage).toBe(0);
  expect(r.sheets[0].examAverage).toBeNull();
  expect(r.sheets[0].termAverage).toBe(12.5);
});
it.each([
  "school",
  "role",
  "peer",
  "year",
  "group",
  "duplicate",
  "extra",
  "private",
  "numeric-string",
  "non-finite",
  "timestamp",
  "kind",
  "result",
  "catalog",
])("rejects %s data", (kind) => {
  const d = data();
  const s = d.sheets[0];
  let c = catalog;
  if (kind === "school") d.schoolId = id(99);
  if (kind === "role") Object.assign(d, { role: "professor" });
  if (kind === "peer") s.enrollmentId = id(99);
  if (kind === "year") s.academicYearId = id(99);
  if (kind === "group") s.classGroupId = id(99);
  if (kind === "duplicate") d.sheets.push(s);
  if (kind === "extra") Object.assign(d, { allStudents: [] });
  if (kind === "private") Object.assign(s, { observation: "Private" });
  if (kind === "numeric-string") Object.assign(s, { termAverage: "12" });
  if (kind === "non-finite") s.termAverage = Infinity;
  if (kind === "timestamp") s.publishedAt = "2026-10-01";
  if (kind === "kind") Object.assign(s, { kind: "draft" });
  if (kind === "result") Object.assign(s, { result: "approved" });
  if (kind === "catalog") c = { ...catalog, schoolId: id(99) };
  expect(() => parseAcademicResults(d, ctx, c)).toThrow("Contrato de resultados");
});
it("loads, filters and refreshes the actual gateway results", async () => {
  const d = data();
  d.sheets.push({ ...d.sheets[0], id: id(10), kind: "annual", title: "Pauta anual publicada" });
  const read = vi
    .fn()
    .mockResolvedValueOnce(d)
    .mockResolvedValueOnce({ ...d, sheets: [] });
  render(<InstitutionalResults ctx={ctx} catalog={catalog} gateway={gateway(read)} />);
  await screen.findByRole("heading", { name: "Pauta publicada" });
  expect(screen.getAllByText("Aprovado")).toHaveLength(2);
  expect(screen.getAllByText("Sem média publicada")).toHaveLength(2);
  fireEvent.change(screen.getByLabelText("Tipo de pauta"), { target: { value: "annual" } });
  expect(screen.queryByRole("heading", { name: "Pauta publicada" })).toBeNull();
  expect(screen.getByRole("heading", { name: "Pauta anual publicada" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Actualizar pautas" }));
  await screen.findByText("Sem pautas publicadas para os filtros seleccionados.");
  expect(read).toHaveBeenCalledTimes(2);
});
it("aborts and discards an old school result", async () => {
  let resolve!: (d: AcademicResults) => void;
  const read = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<AcademicResults>((r) => {
          resolve = r;
        }),
    )
    .mockResolvedValueOnce({ schoolId: id(99), role: "aluno", sheets: [] });
  const g = gateway(read);
  const view = render(<InstitutionalResults ctx={ctx} catalog={catalog} gateway={g} />);
  const next = { ...ctx, schoolId: id(99) };
  view.rerender(
    <InstitutionalResults
      ctx={next}
      catalog={{ ...catalog, schoolId: next.schoolId, classes: [] }}
      gateway={g}
    />,
  );
  expect(read.mock.calls[0][2].aborted).toBe(true);
  resolve(data());
  await screen.findByText("Sem pautas publicadas para os filtros seleccionados.");
  expect(screen.queryByText("Pauta publicada")).toBeNull();
});
it.each([401, 403])("reports %s to the parent without showing cached results", async (status) => {
  const error = new ApiError(status, "Acesso recusado");
  const onAccessError = vi.fn();
  render(
    <InstitutionalResults
      ctx={ctx}
      catalog={catalog}
      gateway={gateway(vi.fn().mockRejectedValue(error))}
      onAccessError={onAccessError}
    />,
  );
  await screen.findByRole("alert");
  await waitFor(() => expect(onAccessError).toHaveBeenCalledWith(error));
  expect(screen.queryByText("Pauta publicada")).toBeNull();
});
it("uses a fresh authenticated token and validates the HTTP results", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({
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
    })
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => data() });
  vi.stubGlobal("fetch", fetch);
  const accessToken = vi.fn().mockResolvedValueOnce("first").mockResolvedValueOnce("refreshed");
  const api = new ApiGateway("/api/mobile-v4", { accessToken });
  await api.session();
  expect((await api.academicResults(ctx, catalog)).sheets).toHaveLength(1);
  expect(fetch.mock.calls[1][0]).toBe(`/api/mobile-v4/schools/${ctx.schoolId}/results?role=aluno`);
  expect(fetch.mock.calls[1][1].headers.Authorization).toBe("Bearer refreshed");
});
