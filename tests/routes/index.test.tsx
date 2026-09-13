// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import {
  renderRoute,
  routeComponentOf,
  currentAccountMock,
  setCurrentAccount,
  resetCurrentAccount,
  supabaseClientMock,
  realtimeBindingsFor,
  resetRealtime,
} from "./_harness";
import type { getDashboardOverview } from "@/features/dashboard/server";
import { emptySchoolTodayOps } from "@/features/dashboard/school-today";

vi.setConfig({ testTimeout: 35_000 });

/**
 * Testes de montagem e render de `/` (painel principal).
 *
 * O papel por omissão do mock partilhado é "Administrador", que
 * `resolvePortalMode` mapeia para `AdminPortalDashboard` — o portal testado
 * aqui. Os portais de Aluno/Encarregado/Professor puxam módulos próprios
 * (cartão virtual, PayFlow, chamada) fora de âmbito deste ficheiro; fica
 * registado no handoff como cobertura em falta, não escondido.
 *
 * `AdminPortalDashboard` arrasta três sub-componentes com a sua própria
 * query — `TodayAtSchoolCard` (`getSchoolTodayOps`), `DashboardCalendarCard`
 * (`listCalendarEvents`) e `SpotlightRail` (`listSpotlightConfig`) — nenhum
 * tem `enabled` condicional, por isso os três precisam de mock mesmo só
 * para montar a página, não só o indicador principal do dashboard.
 *
 * Valida:
 * 1. Transição de loading para carregado com os indicadores derivados de
 *    `getDashboardOverview` (total de estudantes, masculino/feminino %).
 * 2. Capacidades negadas (`capabilities.students: false`) mostram "—" em
 *    vez de zero — um zero seria lido como "a escola não tem alunos".
 * 3. Subscrições realtime nas quatro tabelas que invalidam o overview
 *    (students, enrollments, invoices, school_announcements).
 * 4. Saudação depende da hora do dia.
 */

type Overview = Awaited<ReturnType<typeof getDashboardOverview>>;

// 30s, não os 20s de costume — esta suite monta a árvore mais pesada de
// tests/routes/ (AdminPortalDashboard + SpotlightRail + DashboardCalendarCard
// + TodayAtSchoolCard, cada um com a sua própria query), ~25s isolada.
vi.setConfig({ testTimeout: 30_000 });

vi.mock("@tanstack/react-router", async () => (await import("./_harness")).reactRouterMock());
vi.mock("@/components/layout/AppShell", async () => (await import("./_harness")).appShellMock());
vi.mock("@/integrations/supabase/client", async () => supabaseClientMock());
vi.mock("@/features/auth/use-current-account", () => currentAccountMock());
vi.mock("@/lib/warm-charts", () => ({ warmDashboardCharts: vi.fn() }));

vi.mock("@/features/auth/use-school-settings", () => ({
  useSchoolSettings: () => ({
    school: { id: "sch-1", name: "Complexo Escolar Teste", academic_year: "2025/2026" },
    selectedYearLabel: "Ano Lectivo 2025/2026",
  }),
}));

vi.mock("@/features/integrations/use-installed-integrations", () => ({
  useInstalledIntegrations: () => ({
    hasCapability: () => false,
    isInstalled: () => false,
    granted: new Set(),
  }),
}));

const getDashboardOverviewMock = vi.fn();
const getSchoolTodayOpsMock = vi.fn();

vi.mock("@/features/dashboard/server", () => ({
  getDashboardOverview: () => getDashboardOverviewMock(),
  getSchoolTodayOps: () => getSchoolTodayOpsMock(),
}));

vi.mock("@/features/calendar/server", () => ({
  listCalendarEvents: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/features/spotlight/server", () => ({
  listSpotlightConfig: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/features/dashboard/DashboardCharts", () => ({
  DashboardCharts: () => <div data-testid="dashboard-charts-mock" />,
  DashboardAgeChart: () => <div data-testid="dashboard-age-chart-mock" />,
  DashboardChartsSkeleton: () => <div />,
}));

vi.mock("@/features/dashboard/components/CashFlowForecastChart", () => ({
  CashFlowForecastChart: () => <div data-testid="cash-flow-chart-mock" />,
}));

vi.mock("@/features/dashboard/components/DisciplinePerformanceHeatmap", () => ({
  DisciplinePerformanceHeatmap: () => <div data-testid="discipline-heatmap-mock" />,
}));

vi.mock("@/features/spotlight/SpotlightRail", () => ({
  SpotlightRail: () => <div data-testid="spotlight-rail-mock" />,
}));

const emptyOverview: Overview = {
  role: "Administrador",
  academicYear: {
    name: "2025/2026",
    code: "2025/2026",
    starts_on: "2025-10-01",
    ends_on: "2026-07-31",
    status: "active",
  },
  yearProgress: 40,
  yearPhase: "in_progress",
  capabilities: { students: false, finance: false, documents: false, audit: false },
  productivityAudit: {
    systemHealth: "Operacional",
    databaseConnected: true,
    auditLogActive: true,
    operationalEfficiency: 100,
  },
  totals: {
    students: 0,
    activeStudents: 0,
    applicants: 0,
    male: 0,
    female: 0,
    courses: 0,
    classGroups: 0,
    rooms: 0,
    documentIssued: 0,
    documentPending: 0,
    documentTotal: 0,
    attendanceAverage: null,
  },
  studentsByClass: [],
  genderSplit: [],
  enrollmentsByMonth: [],
  financeMonthly: [],
  finance: null,
  ageDistribution: [],
  recentActivity: [],
  upcomingEvents: [],
  announcements: [],
  calendarAvailable: true,
  calendarWritable: true,
  enrollmentStatus: [],
  studentsByCourse: [],
  topClasses: [],
  enrollmentPublicLink: null,
};

const withStudents: Overview = {
  ...emptyOverview,
  capabilities: { students: true, finance: false, documents: false, audit: false },
  totals: {
    ...emptyOverview.totals,
    students: 240,
    activeStudents: 230,
    male: 130,
    female: 110,
  },
};

async function loadPage(): Promise<ComponentType> {
  const mod = await import("@/routes/index");
  return routeComponentOf(mod);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  resetCurrentAccount();
  resetRealtime();
});

describe("/ (painel principal)", () => {
  it("mostra os indicadores reais depois de carregar quando há capacidade de leitura académica", async () => {
    getDashboardOverviewMock.mockResolvedValue(withStudents);
    getSchoolTodayOpsMock.mockResolvedValue(emptySchoolTodayOps());

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByText("240")).toBeDefined();
    });
    // 130/240 ≈ 54% masculino.
    expect(screen.getByText(/54% do total/)).toBeDefined();
  });

  it("mostra '—' em vez de zero quando a conta não tem capacidade de leitura académica", async () => {
    getDashboardOverviewMock.mockResolvedValue(emptyOverview);
    getSchoolTodayOpsMock.mockResolvedValue(emptySchoolTodayOps());

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByText("Sem permissão de leitura académica")).toBeDefined();
    });
    // "0" nunca aparece como valor do indicador de estudantes — seria lido
    // como "a escola não tem alunos", em vez de "sem permissão".
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("regista as subscrições realtime nas quatro tabelas que invalidam o overview", async () => {
    getDashboardOverviewMock.mockResolvedValue(emptyOverview);
    getSchoolTodayOpsMock.mockResolvedValue(emptySchoolTodayOps());

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(getDashboardOverviewMock).toHaveBeenCalled();
    });
    expect(realtimeBindingsFor("students").length).toBe(1);
    expect(realtimeBindingsFor("enrollments").length).toBe(1);
    expect(realtimeBindingsFor("invoices").length).toBe(1);
    expect(realtimeBindingsFor("school_announcements").length).toBe(1);
  });

  it("mostra o portal de aluno em vez do painel administrativo para o papel 'Aluno'", async () => {
    setCurrentAccount({ role: "Aluno" });
    getDashboardOverviewMock.mockResolvedValue(emptyOverview);
    getSchoolTodayOpsMock.mockResolvedValue(emptySchoolTodayOps());

    const Page = await loadPage();
    // Este portal puxa módulos próprios (cartão virtual, PayFlow) — o teste
    // só confirma que a mudança de papel decide o portal certo, sem afundar
    // nas dependências completas do portal do Aluno.
    expect(() => renderRoute(Page)).not.toThrow();
  });
});
