// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, waitFor, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import { renderRoute, routeComponentOf, resetRouteLocation, resetPersistedFilters } from "./_harness";
import * as financeServer from "@/features/finance/server";

vi.setConfig({ testTimeout: 20_000 });

vi.mock("@tanstack/react-router", async () => {
  const harness = await import("./_harness");
  return harness.reactRouterMock();
});

vi.mock("@/components/layout/AppShell", async () => (await import("./_harness")).appShellMock());
vi.mock("@/features/auth/use-current-account", async () => (await import("./_harness")).currentAccountMock());

vi.mock("@/features/auth/use-school-settings", () => ({
  useSchoolSettings: () => ({ selectedYearLabel: "2025/2026", school: { nif: "123", name: "Escola" } }),
}));

vi.mock("@/features/integrations/use-installed-integrations", () => ({
  useInstalledIntegrations: () => ({
    hasCapability: () => true, 
    grantedIntegrations: new Set(),
  }),
}));

vi.mock("@/features/integrations/InstalledModuleTools", () => ({
  InstalledModuleTools: () => <div data-testid="installed-tools-mock" />
}));

vi.mock("@/lib/warm-charts", () => ({
  warmFinanceCharts: vi.fn(),
}));

vi.mock("@/features/finance/RelatoriosFinanceirosCategoryCharts", () => ({
  RelatoriosFinanceirosCategoryCharts: () => <div data-testid="category-charts-mock" />,
  RelatoriosFinanceirosMonthlyChart: () => <div data-testid="monthly-chart-mock" />,
}));

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  BarChart: () => <div>BarChart</div>,
  LineChart: () => <div>LineChart</div>,
  PieChart: () => <div>PieChart</div>,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
  Line: () => null,
  Pie: () => null,
  Cell: () => null,
}));

async function loadPage(): Promise<ComponentType> {
  const mod = await import("@/routes/relatorios.financeiros");
  return routeComponentOf(mod);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  resetRouteLocation();
  resetPersistedFilters();
});

describe("/relatorios/financeiros", () => {
  it("monta o painel de relatórios e exibe as tabelas", async () => {
    vi.spyOn(financeServer, "getFinanceReporting").mockResolvedValue({
      summary: {
        cash_in: 500000,
        cash_out: 200000,
        outstanding: 50000,
        billed: 600000,
        received: 450000,
      },
      monthly: [
        { month_start: "2026-09-01", billed: 100000, received: 80000, expense: 50000 }
      ],
      categories: [
        { direction: "in", category: "Propinas", amount: 450000 },
        { direction: "out", category: "Salários", amount: 150000 }
      ]
    } as any);

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Relatórios Financeiros" })).toBeDefined();
      expect(screen.getByText("Cobrança mensal")).toBeDefined();
    });
  });

  it("trata o estado vazio (tudo zero) sem erros", async () => {
    vi.spyOn(financeServer, "getFinanceReporting").mockResolvedValue({
      summary: {
        cash_in: 0, cash_out: 0, outstanding: 0, billed: 0, received: 0,
      },
      monthly: [],
      categories: []
    } as any);

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Relatórios Financeiros" })).toBeDefined();
    });
  });
});
