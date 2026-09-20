// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import { renderRoute, routeComponentOf } from "./_harness";
import type { listHrPayrollRuns } from "@/features/hr/server";
import type { PayrollItemReviewRow } from "@/features/hr/payroll";

/**
 * Testes de montagem e render de `/financeiro/rh/folha`.
 *
 * Valida o processamento da folha salarial:
 * 1. Transição de loading para carregado com a lista de competências.
 * 2. Estado vazio de competências.
 * 3. Selecção de uma competência: indicadores, itens calculados e o botão
 *    de cálculo/recálculo conforme o estado.
 * 4. Competência "review" com itens mostra "Aprovar e bloquear"; uma
 *    competência sem itens não mostra o botão, mesmo em "review" — aprovar
 *    uma folha vazia não faz sentido.
 * 5. Folha ainda sem itens mostra o estado vazio "A folha ainda não foi
 *    calculada" com atalho para calcular.
 */

type Run = Awaited<ReturnType<typeof listHrPayrollRuns>>[number];

vi.setConfig({ testTimeout: 20_000 });

vi.mock("@tanstack/react-router", async () => (await import("./_harness")).reactRouterMock());
vi.mock("@/components/layout/AppShell", async () => (await import("./_harness")).appShellMock());

const listHrPayrollRunsMock = vi.fn();
const getPayrollRunDetailMock = vi.fn();
const createPayrollRunMock = vi.fn();
const calculatePayrollRunMock = vi.fn();
const approvePayrollRunMock = vi.fn();

vi.mock("@/features/hr/server", () => ({
  listHrPayrollRuns: () => listHrPayrollRunsMock(),
}));

vi.mock("@/features/hr/payroll", () => ({
  getPayrollRunDetail: (input: unknown) => getPayrollRunDetailMock(input),
  createPayrollRun: (input: unknown) => createPayrollRunMock(input),
  calculatePayrollRun: (input: unknown) => calculatePayrollRunMock(input),
  approvePayrollRun: (input: unknown) => approvePayrollRunMock(input),
}));

const reviewRun: Run = {
  id: "run-1",
  competence_year: 2026,
  competence_month: 8,
  period_start: "2026-08-01",
  period_end: "2026-08-31",
  status: "review",
  total_gross_kz: 500000,
  total_deductions_kz: 20000,
  total_net_kz: 480000,
  approved_at: null,
  paid_at: null,
} as Run;

const reviewRunItem: PayrollItemReviewRow = {
  id: "item-1",
  employmentId: "emp-1",
  personName: "Rita Sequeira",
  employeeNumber: "FUNC-010",
  salaryType: "monthly",
  remunerationModel: "monthly",
  baseAmountKz: 450000,
  hourlyAmountKz: 0,
  allowancesKz: 30000,
  bonusesKz: 0,
  overtimeKz: 0,
  deductionsKz: 20000,
  grossAmountKz: 480000,
  netAmountKz: 460000,
  status: "calculated",
  calculationDetails: {},
};

function detailFor(run: Run, items: PayrollItemReviewRow[]) {
  return {
    run: {
      id: String(run.id),
      competenceYear: Number(run.competence_year),
      competenceMonth: Number(run.competence_month),
      periodStart: String(run.period_start),
      periodEnd: String(run.period_end),
      status: String(run.status),
      totalGrossKz: Number(run.total_gross_kz ?? 0),
      totalDeductionsKz: Number(run.total_deductions_kz ?? 0),
      totalNetKz: Number(run.total_net_kz ?? 0),
      approvedAt: null,
      notes: null,
    },
    items,
  };
}

async function loadPage(): Promise<ComponentType> {
  const mod = await import("@/routes/financeiro.rh.folha");
  return routeComponentOf(mod);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("/financeiro/rh/folha", () => {
  it("mostra loading e depois a lista de competências carregadas", async () => {
    listHrPayrollRunsMock.mockResolvedValue([reviewRun]);

    const Page = await loadPage();
    renderRoute(Page);

    expect(screen.getByText(/A carregar competências/)).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText("Agosto 2026")).toBeDefined();
    });
    // Nenhuma competência seleccionada por omissão.
    expect(screen.getByText("Nenhuma competência seleccionada")).toBeDefined();
  });

  it("mostra o estado vazio quando não há competências", async () => {
    listHrPayrollRunsMock.mockResolvedValue([]);

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByText("Ainda não existem folhas salariais")).toBeDefined();
    });
  });

  it("mostra os indicadores e os itens ao seleccionar uma competência com itens calculados", async () => {
    listHrPayrollRunsMock.mockResolvedValue([reviewRun]);
    getPayrollRunDetailMock.mockResolvedValue(detailFor(reviewRun, [reviewRunItem]));

    const Page = await loadPage();
    renderRoute(Page);

    const runButton = await screen.findByText("Agosto 2026");
    fireEvent.click(runButton);

    await waitFor(() => {
      expect(screen.getByText("Rita Sequeira")).toBeDefined();
    });
    expect(getPayrollRunDetailMock).toHaveBeenCalledWith({ data: { payrollRunId: "run-1" } });
    // Estado "review" com itens: mostra Recalcular e Aprovar e bloquear.
    expect(screen.getByRole("button", { name: "Recalcular" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Aprovar e bloquear" })).toBeDefined();
  });

  it("não mostra 'Aprovar e bloquear' numa competência em revisão sem itens calculados", async () => {
    listHrPayrollRunsMock.mockResolvedValue([reviewRun]);
    getPayrollRunDetailMock.mockResolvedValue(detailFor(reviewRun, []));

    const Page = await loadPage();
    renderRoute(Page);

    const runButton = await screen.findByText("Agosto 2026");
    fireEvent.click(runButton);

    await waitFor(() => {
      expect(screen.getByText("A folha ainda não foi calculada")).toBeDefined();
    });
    expect(screen.queryByRole("button", { name: "Aprovar e bloquear" })).toBeNull();
    // "review" continua na lista de estados que permitem calcular — o botão
    // aparece duas vezes (acção do painel + estado vazio dos itens).
    expect(screen.getAllByRole("button", { name: "Calcular folha" }).length).toBe(2);
  });

  it("chama calculatePayrollRun ao clicar em 'Calcular folha' no estado vazio de itens", async () => {
    listHrPayrollRunsMock.mockResolvedValue([reviewRun]);
    getPayrollRunDetailMock.mockResolvedValue(detailFor(reviewRun, []));
    calculatePayrollRunMock.mockResolvedValue({ skipped_items: 0 });

    const Page = await loadPage();
    renderRoute(Page);

    const runButton = await screen.findByText("Agosto 2026");
    fireEvent.click(runButton);

    // Botão duplicado (acção do painel + estado vazio dos itens) — os dois
    // disparam a mesma mutação, clicar em qualquer um chega.
    const calculateButtons = await screen.findAllByRole("button", { name: "Calcular folha" });
    fireEvent.click(calculateButtons[0]);

    await waitFor(() => {
      expect(calculatePayrollRunMock).toHaveBeenCalledWith({ data: { payrollRunId: "run-1" } });
    });
  });
});
