// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import { renderRoute, routeComponentOf } from "./_harness";
import type { HrDashboardData } from "@/features/hr/server";

/**
 * Testes de montagem e render de `/financeiro/rh`.
 *
 * Valida os fluxos essenciais do resumo de RH:
 * 1. Transição de loading para carregado com os indicadores da StatGrid.
 * 2. Contingência de esquema em falta (`ready: false`) a substituir os
 *    indicadores por um aviso de migração — os totais a zero seriam lidos
 *    como resultado real da escola.
 * 3. Ramo de erro do dashboard — colapsa a página inteira num único painel.
 * 4. Estado vazio de folhas salariais quando o dashboard carrega sem erro.
 * 5. A emissão do QR de presença docente não pertence a esta página.
 *
 * A emissão do QR de presença mudou para `/financeiro/rh/aulas` — os testes
 * dessa finalidade vivem em `financeiro-rh-aulas.test.tsx`.
 */

type Payroll = Awaited<ReturnType<typeof import("@/features/hr/server").listHrPayrollRuns>>[number];

// 5s por omissão aperta quando a pasta inteira corre em paralelo (vários
// forks a competer por CPU) — mesma mitigação de faturas.test.tsx e
// documentos.test.tsx.
vi.setConfig({ testTimeout: 20_000 });

vi.mock("@tanstack/react-router", async () => (await import("./_harness")).reactRouterMock());
vi.mock("@/components/layout/AppShell", async () => (await import("./_harness")).appShellMock());

const getHrDashboardMock = vi.fn();
const listHrPayrollRunsMock = vi.fn();

vi.mock("@/features/hr/server", () => ({
  getHrDashboard: () => getHrDashboardMock(),
  listHrPayrollRuns: () => listHrPayrollRunsMock(),
}));

const readyDashboard: HrDashboardData = {
  ready: true,
  employeeCount: 12,
  activeContractCount: 10,
  payrollDraftCount: 1,
  latestPayroll: {
    id: "run-1",
    competence_year: 2026,
    competence_month: 8,
    status: "paid",
    total_gross_kz: 1200000,
    total_deductions_kz: 150000,
    total_net_kz: 1050000,
  },
};

const samplePayroll: Payroll = {
  id: "run-1",
  competence_year: 2026,
  competence_month: 8,
  period_start: "2026-08-01",
  period_end: "2026-08-31",
  status: "paid",
  total_gross_kz: 1200000,
  total_deductions_kz: 150000,
  total_net_kz: 1050000,
  approved_at: "2026-08-28T00:00:00Z",
  paid_at: "2026-08-30T00:00:00Z",
} as Payroll;

async function loadPage(): Promise<ComponentType> {
  const mod = await import("@/routes/financeiro.rh");
  return routeComponentOf(mod);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("/financeiro/rh", () => {
  it("mostra loading e depois os indicadores carregados", async () => {
    getHrDashboardMock.mockResolvedValue(readyDashboard);
    listHrPayrollRunsMock.mockResolvedValue([samplePayroll]);

    const Page = await loadPage();
    renderRoute(Page);

    expect(screen.getByText(/A carregar folhas salariais/)).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText("12")).toBeDefined();
    });
    expect(screen.getByText("10")).toBeDefined();
    // Formatação exacta do kwanza (separadores, ICU) não é o objecto deste
    // teste — confirma-se apenas que o valor chegou ao ecrã. Aparece duas
    // vezes: no indicador "Último líquido" e na linha da tabela de folhas.
    expect(
      screen.getAllByText((text) => /Kz/.test(text) && /1.?050.?000/.test(text)).length,
    ).toBeGreaterThan(0);
  });

  it("substitui os indicadores por um aviso quando o esquema de RH não está pronto", async () => {
    getHrDashboardMock.mockResolvedValue({
      ready: false,
      employeeCount: 0,
      activeContractCount: 0,
      payrollDraftCount: 0,
      latestPayroll: null,
    } satisfies HrDashboardData);
    listHrPayrollRunsMock.mockResolvedValue([]);

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByText("Fundação do RH pronta para migração")).toBeDefined();
    });
    // Os indicadores não devem aparecer — zeros seriam lidos como dado real.
    expect(screen.queryByText("Funcionários activos")).toBeNull();
  });

  it("substitui toda a página por um único painel de erro quando o dashboard falha", async () => {
    // O componente é um if/else-if/else único: um erro no `dashboard` não
    // deixa as secções de aulas/folhas por baixo — a página inteira colapsa
    // no painel "Acesso ao RH". Vale a pena fixar isto: mudar a estrutura
    // para painéis independentes é uma escolha visível para quem usa RH.
    getHrDashboardMock.mockRejectedValue(new Error("Sem permissão para consultar dados de RH."));
    listHrPayrollRunsMock.mockResolvedValue([samplePayroll]);

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByText("Sem permissão para consultar dados de RH.")).toBeDefined();
    });
    expect(screen.queryByText("Ainda não existem folhas salariais.")).toBeNull();
    expect(screen.queryByText(String(samplePayroll.status))).toBeNull();
  });

  // UMA PÁGINA = UMA FINALIDADE: a folha salarial não emite QR de presença.
  // Se o painel voltar a esta página, este teste falha antes da revisão.
  it("não apresenta a emissão de QR de presença docente", async () => {
    getHrDashboardMock.mockResolvedValue(readyDashboard);
    listHrPayrollRunsMock.mockResolvedValue([samplePayroll]);

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByText("Folhas salariais")).toBeDefined();
    });
    expect(screen.queryByText("Presença docente por QR")).toBeNull();
    expect(screen.queryByRole("button", { name: /QR entrada/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /QR saída/ })).toBeNull();
  });

  it("mostra o estado vazio de folhas salariais quando o dashboard carrega mas não há folhas", async () => {
    getHrDashboardMock.mockResolvedValue(readyDashboard);
    listHrPayrollRunsMock.mockResolvedValue([]);

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByText("Ainda não existem folhas salariais.")).toBeDefined();
    });
  });
});
