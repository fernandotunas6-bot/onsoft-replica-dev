// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import {
  renderRoute,
  resetPersistedFilters,
  resetRouteLocation,
  routeComponentOf,
} from "./_harness";
import type {
  getFinanceReporting,
  getFinanceSchemaStatus,
  listCashEntries,
  listInvoices,
  listPaymentPlans,
} from "@/features/finance/server";

/**
 * Smoke de render de `/financeiro`.
 *
 * Além da transição loading → carregado, fixa os dois avisos que dependem do
 * estado do schema: são o que o utilizador vê quando o SQL de finanças ainda
 * não foi aplicado, e a lógica que os escolhe (`schemaBlocked` vs. plano de
 * propinas em falta) vive só no render — nenhum teste de lógica lhe chega.
 */

type SchemaStatus = Awaited<ReturnType<typeof getFinanceSchemaStatus>>;
type Reporting = Awaited<ReturnType<typeof getFinanceReporting>>;
type CashEntry = Awaited<ReturnType<typeof listCashEntries>>[number];
type Invoice = Awaited<ReturnType<typeof listInvoices>>[number];
type PaymentPlan = Awaited<ReturnType<typeof listPaymentPlans>>[number];

// Montar uma rota real em jsdom leva ~1s isolado, mas passa facilmente dos 5s
// por omissão quando a suite inteira corre em paralelo (o handoff já regista
// falhas por carga da máquina no Ciclo 71). Timeout explícito para estes
// testes: fica a medir o render, não a fila de CPU.
vi.setConfig({ testTimeout: 20_000 });

vi.mock("@tanstack/react-router", async () => (await import("./_harness")).reactRouterMock());
vi.mock("@/components/layout/AppShell", async () => (await import("./_harness")).appShellMock());

const listCashEntriesMock = vi.fn();
const listInvoicesMock = vi.fn();
const getFinanceReportingMock = vi.fn();
const getFinanceSchemaStatusMock = vi.fn();
const listPaymentPlansMock = vi.fn();

vi.mock("@/features/finance/server", () => ({
  listCashEntries: () => listCashEntriesMock(),
  listInvoices: () => listInvoicesMock(),
  getFinanceReporting: () => getFinanceReportingMock(),
  getFinanceSchemaStatus: () => getFinanceSchemaStatusMock(),
  listPaymentPlans: () => listPaymentPlansMock(),
  cancelPaymentPlan: vi.fn(),
  createPaymentPlan: vi.fn(),
  recordCashExpense: vi.fn(),
  recordInvoicePayment: vi.fn(),
  reverseCashEntry: vi.fn(),
}));

vi.mock("@/features/arquivos/server", () => ({
  archiveFinanceDocument: vi.fn(),
}));

const healthySchema: SchemaStatus = {
  ready: true,
  missingPenaltyAmount: false,
  missingActiveFeePlan: false,
  missingCashExpenses: false,
};

const emptyReporting: Reporting = {
  summary: {
    billed: 0,
    received: 0,
    outstanding: 0,
    overdue: 0,
    invoice_count: 0,
    open_invoice_count: 0,
    overdue_invoice_count: 0,
    billed_student_count: 0,
    cash_in: 0,
    cash_out: 0,
    cash_balance: 0,
    truncated: false,
  },
  monthly: [],
  categories: [],
};

function seed({
  schema = healthySchema,
  cash = [] as CashEntry[],
  invoices = [] as Invoice[],
  plans = [] as PaymentPlan[],
}: {
  schema?: SchemaStatus;
  cash?: CashEntry[];
  invoices?: Invoice[];
  plans?: PaymentPlan[];
} = {}) {
  getFinanceSchemaStatusMock.mockResolvedValue(schema);
  getFinanceReportingMock.mockResolvedValue(emptyReporting);
  listCashEntriesMock.mockResolvedValue(cash);
  listInvoicesMock.mockResolvedValue(invoices);
  listPaymentPlansMock.mockResolvedValue(plans);
}

let Financeiro: ComponentType;

beforeAll(async () => {
  Financeiro = routeComponentOf(await import("@/routes/financeiro"));
}, 60_000);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  resetRouteLocation();
  resetPersistedFilters();
});

describe("/financeiro — render", () => {
  it("atravessa a transição loading → carregado sem rebentar", async () => {
    seed();

    renderRoute(Financeiro);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Caixa e Pagamentos" })).toBeDefined();
    });
    expect(getFinanceSchemaStatusMock).toHaveBeenCalled();
  });

  it("bloqueia a emissão quando faltam colunas de schema", async () => {
    seed({
      schema: { ...healthySchema, ready: false, missingPenaltyAmount: true },
    });

    renderRoute(Financeiro);

    await waitFor(() => {
      expect(screen.getByText("Emissão de faturas bloqueada")).toBeDefined();
    });
    // Com o schema partido o aviso do plano de propinas não deve aparecer:
    // seriam dois alertas a competir pela mesma acção do utilizador.
    expect(screen.queryByText("Plano de propinas em falta")).toBeNull();
  });

  it("pede o plano de propinas quando o schema está bom mas o plano não existe", async () => {
    seed({
      schema: { ...healthySchema, missingActiveFeePlan: true },
    });

    renderRoute(Financeiro);

    await waitFor(() => {
      expect(screen.getByText("Plano de propinas em falta")).toBeDefined();
    });
    expect(screen.queryByText("Emissão de faturas bloqueada")).toBeNull();
  });
});
