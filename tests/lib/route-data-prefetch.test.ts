// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { prefetchRouteData } from "@/lib/route-data-prefetch";

const api = vi.hoisted(() => {
  const fn = () => vi.fn<(args?: { data?: unknown; signal?: AbortSignal }) => Promise<unknown>>();
  return {
    students: fn(),
    academic: fn(),
    calendar: fn(),
    announcements: fn(),
    dashboard: fn(),
    documents: fn(),
    reporting: fn(),
    cash: fn(),
    invoices: fn(),
    plans: fn(),
    staff: fn(),
    teachers: fn(),
    people: fn(),
    accounts: fn(),
  };
});
vi.mock("@/features/students/server", () => ({ searchStudents: api.students }));
vi.mock("@/features/academic/server", () => ({ listPedagogicalWorkspace: api.academic }));
vi.mock("@/features/calendar/server", () => ({ listCalendarEvents: api.calendar }));
vi.mock("@/features/communications/server", () => ({ listSchoolAnnouncements: api.announcements }));
vi.mock("@/features/dashboard/server", () => ({ getDashboardOverview: api.dashboard }));
vi.mock("@/features/documents/server", () => ({ listDocumentWorkspace: api.documents }));
vi.mock("@/features/finance/server", () => ({
  getFinanceReporting: api.reporting,
  listCashEntries: api.cash,
  listInvoices: api.invoices,
  listPaymentPlans: api.plans,
}));
vi.mock("@/features/people/server", () => ({
  listStaffDirectory: api.staff,
  listTeachers: api.teachers,
  searchPeople: api.people,
}));
vi.mock("@/features/access/server", () => ({ listSystemAccounts: api.accounts }));
vi.mock("@/lib/warm-charts", () => ({
  warmDashboardCharts: vi.fn(),
  warmFinanceCharts: vi.fn(),
  warmPedagogicaCharts: vi.fn(),
  warmReportCharts: vi.fn(),
}));

const scope = { schoolId: "school-A", academicYearId: "year-A" };
let client: QueryClient;
const settled = () => vi.waitFor(() => expect(client.isFetching()).toBe(0));

beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of Object.values(api)) fn.mockResolvedValue([]);
  localStorage.clear();
  Object.defineProperty(navigator, "connection", { configurable: true, value: undefined });
  client = new QueryClient({ defaultOptions: { queries: { staleTime: 300_000, retry: false } } });
  client.setQueryData(["school", "settings"], { id: scope.schoolId });
});
afterEach(() => client.clear());

describe("pré-busca com a cache e o contexto reais", () => {
  it("partilha um pedido em curso e os dados frescos com a página", async () => {
    let finish!: (value: unknown) => void;
    api.documents.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    prefetchRouteData(client, "/documentos", scope);
    prefetchRouteData(client, "/documentos", scope);
    const page = client.fetchQuery({
      queryKey: ["documents", "workspace"],
      queryFn: () => api.documents({ data: { limit: 250 } }),
    });
    expect(api.documents).toHaveBeenCalledOnce();
    finish({ requests: [] });
    await expect(page).resolves.toEqual({ requests: [] });
    prefetchRouteData(client, "/documentos", scope);
    expect(api.documents).toHaveBeenCalledOnce();
    expect(api.documents.mock.calls[0][0]?.data).toEqual({ limit: 250 });
  });

  it("volta a aquecer depois de uma invalidação, expiração e falha", async () => {
    prefetchRouteData(client, "/documentos", scope);
    await settled();
    await client.invalidateQueries({ queryKey: ["documents", "workspace"], refetchType: "none" });
    prefetchRouteData(client, "/documentos", scope);
    await settled();
    client.setQueryData(["documents", "workspace"], [], { updatedAt: Date.now() - 400_000 });
    api.documents.mockRejectedValueOnce(new Error("network"));
    prefetchRouteData(client, "/documentos", scope);
    await settled();
    prefetchRouteData(client, "/documentos", scope);
    await settled();
    expect(api.documents).toHaveBeenCalledTimes(4);
    expect(client.getQueryState(["documents", "workspace"])?.status).toBe("success");
  });

  it("uma intenção antiga não preenche a cache da escola nova", async () => {
    client.setQueryData(["school", "settings"], { id: "school-B" });
    prefetchRouteData(client, "/documentos", scope);
    expect(api.documents).not.toHaveBeenCalled();
    prefetchRouteData(client, "/documentos", { ...scope, schoolId: "school-B" });
    await settled();
    expect(api.documents).toHaveBeenCalledOnce();
    client.clear();
    prefetchRouteData(client, "/documentos", scope);
    expect(api.documents).toHaveBeenCalledOnce();
  });

  it("o calendário reutiliza exactamente a escola, o ano e os parâmetros da página", async () => {
    prefetchRouteData(client, "/calendario", { ...scope, search: { ano: "year-B" } });
    await settled();
    expect(client.getQueryData(["calendar", "events", "school-A", "year-B"])).toEqual([]);
    expect(api.calendar.mock.calls[0][0]?.data).toEqual({
      limit: 50,
      academicYearId: "year-B",
      includePast: true,
    });
    prefetchRouteData(client, "/calendario", scope);
    await settled();
    expect(client.getQueryData(["calendar", "events", "school-A", "year-A"])).toEqual([]);
    expect(api.calendar).toHaveBeenCalledTimes(2);
  });

  it("a área académica usa o ano seleccionado, incluindo a ausência de ano", async () => {
    prefetchRouteData(client, "/pedagogica", scope);
    await settled();
    expect(client.getQueryData(["academic", "pedagogical-workspace", "year-A"])).toEqual([]);
    prefetchRouteData(client, "/pedagogica", { ...scope, academicYearId: null });
    await settled();
    expect(client.getQueryData(["academic", "pedagogical-workspace", null])).toEqual([]);
  });

  it("Pessoas aquece os filtros guardados, e não uma lista com outra chave", async () => {
    localStorage.setItem(
      "siga:list-filters:pessoas",
      JSON.stringify({
        q: " Ana ",
        province: "Luanda",
        municipality: "",
        role: "professor",
        teacherStatus: "active",
      }),
    );
    prefetchRouteData(client, "/pessoas/", scope);
    await settled();
    expect(client.getQueryData(["people", "search", "Ana", "Luanda", "", "professor"])).toEqual([]);
    expect(client.getQueryData(["people", "teachers", " Ana ", "active"])).toEqual([]);
    expect(api.people.mock.calls[0][0]?.data).toMatchObject({ query: "Ana", role: "professor" });
  });

  it("os filtros explícitos do destino prevalecem sobre os guardados", async () => {
    localStorage.setItem("siga:list-filters:pessoas", JSON.stringify({ q: "Ana" }));
    prefetchRouteData(client, "/pessoas", { ...scope, search: { lf: "q=Joao&role=aluno" } });
    await settled();
    expect(api.people.mock.calls[0][0]?.data).toMatchObject({ query: "Joao", role: "aluno" });
  });

  it("a limpeza de sessão aborta a leitura e uma resposta tardia não repõe os dados", async () => {
    let finish!: (value: unknown) => void;
    api.documents.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    prefetchRouteData(client, "/documentos", scope);
    const signal = api.documents.mock.calls[0][0]?.signal;
    client.clear();
    expect(signal?.aborted).toBe(true);
    finish({ requests: ["old-school"] });
    await settled();
    expect(client.getQueryData(["documents", "workspace"])).toBeUndefined();
  });

  it.each([{ saveData: true }, { effectiveType: "2g" }, { effectiveType: "slow-2g" }])(
    "não disputa uma ligação limitada: %j",
    (connection) => {
      Object.defineProperty(navigator, "connection", { configurable: true, value: connection });
      prefetchRouteData(client, "/documentos", scope);
      expect(api.documents).not.toHaveBeenCalled();
    },
  );

  it("limita a dois pedidos especulativos e permite nova intenção quando terminam", async () => {
    let first!: (value: unknown) => void;
    let second!: (value: unknown) => void;
    api.people.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          first = resolve;
        }),
    );
    api.teachers.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          second = resolve;
        }),
    );
    prefetchRouteData(client, "/pessoas", scope);
    prefetchRouteData(client, "/documentos", scope);
    expect(client.isFetching()).toBe(2);
    expect(api.documents).not.toHaveBeenCalled();
    first([]);
    second([]);
    await settled();
    prefetchRouteData(client, "/documentos", scope);
    await settled();
    expect(api.documents).toHaveBeenCalledOnce();
  });
});
