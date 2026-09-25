// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import {
  realtimeBindingsFor,
  renderRoute,
  resetPersistedFilters,
  resetRealtime,
  resetRouteLocation,
  routeComponentOf,
} from "./_harness";
import type {
  getFinanceReporting,
  getFinanceSchemaStatus,
  listFinanceStudents,
  listInvoices,
} from "@/features/finance/server";

/**
 * Testes de montagem e render de `/faturas`.
 *
 * Valida os fluxos essenciais de tesouraria no frontend:
 * 1. Transição de loading para carregado com exibição de tabela de faturas.
 * 2. Estado vazio com mensagem amigável quando não há registos.
 * 3. Alerta de contingência de esquema quando colunas essenciais faltam no Postgres.
 * 4. Alerta para configuração de plano de propinas.
 * 5. Registo e integridade das subscrições realtime (tabelas invoices e payments).
 * 6. Ramo de erro de API com feedback visual seguro.
 */

type SchemaStatus = Awaited<ReturnType<typeof getFinanceSchemaStatus>>;
type Reporting = Awaited<ReturnType<typeof getFinanceReporting>>;
type Invoice = Awaited<ReturnType<typeof listInvoices>>[number];
type FinanceStudent = Awaited<ReturnType<typeof listFinanceStudents>>[number];

vi.setConfig({ testTimeout: 20_000 });

vi.mock("@tanstack/react-router", async () => (await import("./_harness")).reactRouterMock());
vi.mock("@/components/layout/AppShell", async () => (await import("./_harness")).appShellMock());
vi.mock("@/integrations/supabase/client", async () =>
  (await import("./_harness")).supabaseClientMock(),
);

const listInvoicesMock = vi.fn();
const listFinanceStudentsMock = vi.fn();
const getFinanceReportingMock = vi.fn();
const getFinanceSchemaStatusMock = vi.fn();

vi.mock("@/features/finance/server", () => ({
  listInvoices: () => listInvoicesMock(),
  listFinanceStudents: () => listFinanceStudentsMock(),
  getFinanceReporting: () => getFinanceReportingMock(),
  getFinanceSchemaStatus: () => getFinanceSchemaStatusMock(),
  cancelInvoice: vi.fn(),
  issueInvoice: vi.fn(),
  recordInvoicePayment: vi.fn(),
}));

vi.mock("@/features/auth/use-school-settings", () => ({
  useSchoolSettings: () => ({
    school: {
      id: "sch-1",
      name: "Complexo Escolar Teste",
      nif: "5417009999",
      academic_year: "2025/2026",
    },
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

const healthySchema: SchemaStatus = {
  ready: true,
  missingPenaltyAmount: false,
  missingActiveFeePlan: false,
  missingCashExpenses: false,
};

const sampleReporting: Reporting = {
  summary: {
    billed: 45000,
    received: 0,
    outstanding: 45000,
    overdue: 0,
    invoice_count: 1,
    open_invoice_count: 1,
    overdue_invoice_count: 0,
    billed_student_count: 1,
    cash_in: 0,
    cash_out: 0,
    cash_balance: 0,
    truncated: false,
  },
  monthly: [],
  categories: [],
};

const sampleInvoice: Invoice = {
  id: "inv-001",
  number: "FT-2025/001",
  student_id: "stu-001",
  student_name: "António Manuel",
  registration_number: "2025-0100",
  description: "Propina de Março",
  issued_on: "2026-03-01",
  due_on: "2026-03-15",
  total_amount: 45000,
  amount_paid: 0,
  status: "pending",
};

const sampleStudent: FinanceStudent = {
  student_id: "stu-001",
  registration_number: "2025-0100",
  full_name: "António Manuel",
};

function seed({
  schema = healthySchema,
  invoices = [] as Invoice[],
  students = [] as FinanceStudent[],
  reporting = sampleReporting,
}: {
  schema?: SchemaStatus;
  invoices?: Invoice[];
  students?: FinanceStudent[];
  reporting?: Reporting;
} = {}) {
  getFinanceSchemaStatusMock.mockResolvedValue(schema);
  listInvoicesMock.mockResolvedValue(invoices);
  listFinanceStudentsMock.mockResolvedValue(students);
  getFinanceReportingMock.mockResolvedValue(reporting);
}

let FaturasRouteComponent: ComponentType;

beforeAll(async () => {
  const mod = await import("@/routes/faturas");
  FaturasRouteComponent = routeComponentOf(mod);
}, 60_000);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  resetRouteLocation();
  resetPersistedFilters();
  resetRealtime();
});

describe("/faturas — render", () => {
  it("renderiza a listagem de faturas com dados reais após carregamento", async () => {
    seed({ invoices: [sampleInvoice], students: [sampleStudent] });
    renderRoute(FaturasRouteComponent);

    await waitFor(() => {
      expect(screen.getByText("FT-2025/001")).toBeDefined();
      expect(screen.getByText("António Manuel")).toBeDefined();
      expect(screen.getByText("Propina de Março")).toBeDefined();
    });
  });

  it("apresenta o estado vazio com indicação clara quando não há faturas", async () => {
    seed({ invoices: [], students: [] });
    renderRoute(FaturasRouteComponent);

    await waitFor(() => {
      expect(screen.getByText("Nenhuma factura neste filtro")).toBeDefined();
    });
  });

  it("alerta sobre schema sga incompleto caso faltem colunas essenciais", async () => {
    seed({
      schema: {
        ...healthySchema,
        ready: false,
        missingPenaltyAmount: true,
      },
      invoices: [],
    });
    renderRoute(FaturasRouteComponent);

    await waitFor(() => {
      expect(screen.getByText("Schema SGA incompleto para faturas")).toBeDefined();
    });
  });

  it("alerta sobre plano de propinas em falta quando não configurado", async () => {
    seed({
      schema: {
        ...healthySchema,
        missingActiveFeePlan: true,
      },
      invoices: [],
    });
    renderRoute(FaturasRouteComponent);

    await waitFor(() => {
      expect(screen.getByText("Plano de propinas em falta")).toBeDefined();
      expect(screen.getByText("Configurar propinas")).toBeDefined();
    });
  });

  it("subscreve actualizações em tempo real para invoices e payments", async () => {
    seed({ invoices: [sampleInvoice] });
    renderRoute(FaturasRouteComponent);

    await waitFor(() => {
      expect(screen.getByText("FT-2025/001")).toBeDefined();
    });

    const invoiceBindings = realtimeBindingsFor("invoices");
    const paymentBindings = realtimeBindingsFor("payments");

    expect(invoiceBindings.length).toBeGreaterThanOrEqual(2); // INSERT e UPDATE
    expect(paymentBindings.length).toBeGreaterThanOrEqual(1); // INSERT
  });

  it("trata falha de rede ou de base de dados com mensagem de erro na tabela", async () => {
    getFinanceSchemaStatusMock.mockResolvedValue(healthySchema);
    listInvoicesMock.mockRejectedValue(new Error("Database connection failure"));
    listFinanceStudentsMock.mockResolvedValue([]);
    getFinanceReportingMock.mockResolvedValue(sampleReporting);

    renderRoute(FaturasRouteComponent);

    await waitFor(() => {
      expect(screen.getByText("Não foi possível carregar as faturas.")).toBeDefined();
    });
  });
});
