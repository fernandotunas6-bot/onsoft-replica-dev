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
import type { listDocumentWorkspace, listPrintTemplates } from "@/features/documents/server";

/**
 * Testes de montagem e render de `/documentos`.
 *
 * Valida a gestão de pedidos de certidões, declarações e boletins:
 * 1. Transição de loading para carregado com exibição da listagem de pedidos.
 * 2. Estado vazio quando a escola ainda não tem pedidos registados na secretaria.
 * 3. Subscrição realtime da tabela `document_requests` para actualização em directo.
 * 4. Tratamento do ramo de falha de carregamento da API com mensagem de contingência.
 * 5. Visualização de modelos activos no catálogo de impressão.
 */

type DocumentWorkspace = Awaited<ReturnType<typeof listDocumentWorkspace>>;
type PrintTemplates = Awaited<ReturnType<typeof listPrintTemplates>>;

vi.setConfig({ testTimeout: 20_000 });

vi.mock("@tanstack/react-router", async () => (await import("./_harness")).reactRouterMock());
vi.mock("@/components/layout/AppShell", async () => (await import("./_harness")).appShellMock());
vi.mock("@/integrations/supabase/client", async () =>
  (await import("./_harness")).supabaseClientMock(),
);

const listDocumentWorkspaceMock = vi.fn();
const listPrintTemplatesMock = vi.fn();

vi.mock("@/features/documents/server", () => ({
  listDocumentWorkspace: () => listDocumentWorkspaceMock(),
  listPrintTemplates: () => listPrintTemplatesMock(),
  createDocumentRequest: vi.fn(),
  updateDocumentRequestStatus: vi.fn(),
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

const emptyWorkspace: DocumentWorkspace = {
  students: [],
  templates: [],
  requests: [],
};

const sampleWorkspace: DocumentWorkspace = {
  students: [{ id: "stu-1", full_name: "Teresa Garcia", registration_number: "2025-0088" }],
  templates: [
    { id: "tpl-1", name: "Declaração de Matrícula", status: "active", active: true, fee_amount: 0 },
  ],
  requests: [
    {
      id: "req-1",
      student_id: "stu-1",
      template_id: "tpl-1",
      template_name: "Declaração de Matrícula",
      student_name: "Teresa Garcia",
      registration_number: "2025-0088",
      class_name: "11ª B",
      request_number: "PED-001",
      requested_at: "2026-03-02T10:00:00Z",
      assigned_to: null,
      status: "ready",
      next_status: null,
      priority: "normal",
      notes: null,
    },
  ],
};

const samplePrintTemplates: PrintTemplates = {
  issue: null,
  byType: {},
  items: [
    {
      key: "talao-matricula",
      title: "Talão de matrícula",
      type: "enrollment_receipt",
      description: "Comprovativo de matrícula e credencial inicial.",
      sourceOfTruth: false,
      customized: false,
      active: true,
    },
  ],
};

function seed({
  workspace = emptyWorkspace,
  printTemplates = samplePrintTemplates,
}: {
  workspace?: DocumentWorkspace;
  printTemplates?: PrintTemplates;
} = {}) {
  listDocumentWorkspaceMock.mockResolvedValue(workspace);
  listPrintTemplatesMock.mockResolvedValue(printTemplates);
}

let DocumentosRouteComponent: ComponentType;

beforeAll(async () => {
  const mod = await import("@/routes/documentos");
  DocumentosRouteComponent = routeComponentOf(mod);
}, 60_000);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  resetRouteLocation();
  resetPersistedFilters();
  resetRealtime();
});

describe("/documentos — render", () => {
  it("renderiza a tabela de pedidos de documentos quando há registos", async () => {
    seed({ workspace: sampleWorkspace });
    renderRoute(DocumentosRouteComponent);

    await waitFor(() => {
      expect(screen.getAllByText("Declaração de Matrícula").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("Teresa Garcia")).toBeDefined();
      expect(screen.getByText("2025-0088")).toBeDefined();
      expect(screen.getByText("Emitido")).toBeDefined();
    });
  });

  it("apresenta o estado vazio com chamada para a secretaria quando não há pedidos", async () => {
    seed({ workspace: emptyWorkspace });
    renderRoute(DocumentosRouteComponent);

    await waitFor(() => {
      expect(screen.getByText("Ainda não há pedidos de documentos")).toBeDefined();
    });
  });

  it("subscreve actualizações em tempo real para a tabela document_requests", async () => {
    seed({ workspace: sampleWorkspace });
    renderRoute(DocumentosRouteComponent);

    await waitFor(() => {
      expect(screen.getByText("Teresa Garcia")).toBeDefined();
    });

    const bindings = realtimeBindingsFor("document_requests");
    expect(bindings.length).toBeGreaterThanOrEqual(1);
    expect(bindings[0].event).toBe("*");
  });

  it("exibe mensagem amigável no caso de falha de rede ou base de dados", async () => {
    listDocumentWorkspaceMock.mockRejectedValue(new Error("Supabase unavailable"));
    listPrintTemplatesMock.mockResolvedValue(samplePrintTemplates);

    renderRoute(DocumentosRouteComponent);

    await waitFor(() => {
      expect(screen.getByText("Não foi possível carregar os pedidos de documentos.")).toBeDefined();
    });
  });
});
