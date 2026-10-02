// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import { renderRoute, resetRouteLocation, routeComponentOf } from "./_harness";

vi.setConfig({ testTimeout: 20_000 });

vi.mock("@tanstack/react-router", async () => (await import("./_harness")).reactRouterMock());
vi.mock("@/components/layout/AppShell", async () => (await import("./_harness")).appShellMock());

const listTurnstileDevicesMock = vi.fn();
const registerTurnstileDeviceMock = vi.fn();
const updateTurnstileDeviceMock = vi.fn();
const revealTurnstileDeviceApiKeyMock = vi.fn();
const validateGatePassTokenMock = vi.fn();
const listAccessLogsMock = vi.fn();
const exportGatePassOfflineListMock = vi.fn();
const getCampusVsClassroomReconciliationMock = vi.fn();
const listAccessCardsMock = vi.fn();
const setAccessCardStatusMock = vi.fn();

vi.mock("@/features/catracas/server", () => ({
  listTurnstileDevices: () => listTurnstileDevicesMock(),
  registerTurnstileDevice: (args: unknown) => registerTurnstileDeviceMock(args),
  updateTurnstileDevice: (args: unknown) => updateTurnstileDeviceMock(args),
  revealTurnstileDeviceApiKey: (args: unknown) => revealTurnstileDeviceApiKeyMock(args),
  validateGatePassToken: (args: unknown) => validateGatePassTokenMock(args),
  listAccessLogs: (args: unknown) => listAccessLogsMock(args),
  exportGatePassOfflineList: () => exportGatePassOfflineListMock(),
  getCampusVsClassroomReconciliation: () => getCampusVsClassroomReconciliationMock(),
  listAccessCards: (args: unknown) => listAccessCardsMock(args),
  setAccessCardStatus: (args: unknown) => setAccessCardStatusMock(args),
}));

const sampleDevice = {
  id: "dev-1",
  name: "Catraca Principal 01",
  location: "Portão A - Entrada Principal",
  device_type: "turnstile",
  direction_capability: "bidirectional",
  ip_address: "192.168.1.100",
  status: "online",
  has_api_key: true,
  api_key_hint: "2345",
  school_id: "escola-teste",
};

const sampleLog = {
  id: "log-1",
  person_name: "João Silva",
  direction: "entry" as const,
  device_name: "Catraca Principal 01",
  status: "granted" as const,
  denial_reason: null,
  timestamp: new Date().toISOString(),
};

const sampleCard = {
  id: "card-1",
  card_number: "SIGA-2026-0001",
  barcode: "BAR-001",
  rfid_tag: "RFID-001",
  person_name: "Maria Antónia",
  status: "active",
  student_id: "stu-1",
  person_id: "per-1",
  updated_at: new Date().toISOString(),
};

const sampleRecon = {
  date: "2026-09-10",
  totalCampusEntriesToday: 120,
  anomaliesFound: 1,
  anomalies: [
    {
      studentId: "stu-1",
      studentName: "Carlos Ferreira",
      gateEntryTime: "07:45",
      classroomStatus: "absent",
      severity: "high" as const,
      description: "Estudante entrou na portaria às 07:45 mas está com falta na 1ª aula.",
    },
  ],
};

const emptyRecon = {
  date: "2026-09-10",
  totalCampusEntriesToday: 0,
  anomaliesFound: 0,
  anomalies: [],
};

afterEach(() => {
  cleanup();
  resetRouteLocation();
  vi.clearAllMocks();
});

vi.mock("@/lib/tauri-bridge", () => ({
  isTauriDesktop: () => false,
  checkPythonHardwareBridgeHealth: vi.fn().mockResolvedValue({ online: false }),
  triggerTurnstileRelay: vi.fn().mockResolvedValue({ success: true, source: "mock" }),
  discoverLocalHardwareDevices: vi.fn().mockResolvedValue({ ok: true, devices: [] }),
  loadLocalHardwareAllowlist: vi.fn().mockResolvedValue({ ok: true, devices: [] }),
  saveLocalHardwareAllowlist: vi.fn().mockResolvedValue({ ok: true, devices: [] }),
}));

async function loadCatracasPage(): Promise<ComponentType> {
  const mod = await import("@/routes/catracas");
  return routeComponentOf(mod);
}

describe("/catracas — render", () => {
  it("carrega dispositivos e histórico de acessos na tabela", async () => {
    listTurnstileDevicesMock.mockResolvedValue([sampleDevice]);
    listAccessLogsMock.mockResolvedValue([sampleLog]);
    listAccessCardsMock.mockResolvedValue([sampleCard]);
    getCampusVsClassroomReconciliationMock.mockResolvedValue(sampleRecon);

    const CatracasPage = await loadCatracasPage();
    renderRoute(CatracasPage);

    await waitFor(() => {
      expect(screen.getAllByText("Catraca Principal 01").length).toBeGreaterThan(0);
      expect(screen.getByText("Carlos Ferreira")).toBeDefined();
    });

    expect(
      screen.getByRole("heading", { name: /Catracas & Cartão Virtual de Acesso/i }),
    ).toBeDefined();
    expect(screen.getByText(/Portão A - Entrada Principal/i)).toBeDefined();
    expect(screen.getByText("João Silva")).toBeDefined();
  });

  it("mostra estado vazio quando não há dispositivos cadastrados", async () => {
    listTurnstileDevicesMock.mockResolvedValue([]);
    listAccessLogsMock.mockResolvedValue([]);
    listAccessCardsMock.mockResolvedValue([]);
    getCampusVsClassroomReconciliationMock.mockResolvedValue(emptyRecon);

    const CatracasPage = await loadCatracasPage();
    renderRoute(CatracasPage);

    await waitFor(() => {
      expect(screen.getByText(/Nenhuma catraca física ou leitor registado/i)).toBeDefined();
    });
  });

  it("mostra o painel de conciliação com entradas da portaria vs sala de aula", async () => {
    listTurnstileDevicesMock.mockResolvedValue([sampleDevice]);
    listAccessLogsMock.mockResolvedValue([sampleLog]);
    listAccessCardsMock.mockResolvedValue([sampleCard]);
    getCampusVsClassroomReconciliationMock.mockResolvedValue(sampleRecon);

    const CatracasPage = await loadCatracasPage();
    renderRoute(CatracasPage);

    await waitFor(() => {
      expect(screen.getByText("Carlos Ferreira")).toBeDefined();
    });

    expect(screen.getByText("Conciliação: Portaria vs. Sala de Aula")).toBeDefined();
    expect(screen.getByText(/Estudante entrou na portaria às 07:45/i)).toBeDefined();
  });

  it("permite simular validação de token de passe na portaria", async () => {
    listTurnstileDevicesMock.mockResolvedValue([sampleDevice]);
    listAccessLogsMock.mockResolvedValue([sampleLog]);
    listAccessCardsMock.mockResolvedValue([sampleCard]);
    getCampusVsClassroomReconciliationMock.mockResolvedValue(sampleRecon);
    validateGatePassTokenMock.mockResolvedValue({
      granted: true,
      personName: "Ana Paulo",
      reason: "Cartão activo e regular",
    });

    const CatracasPage = await loadCatracasPage();
    renderRoute(CatracasPage);

    await waitFor(() => {
      expect(screen.getAllByText("Catraca Principal 01").length).toBeGreaterThan(0);
    });

    const tokenInput = screen.getByPlaceholderText(/Digitalize ou digite o número do cartão/i);
    fireEvent.change(tokenInput, { target: { value: "token-teste-jwt-123" } });

    const validateButton = screen.getByRole("button", { name: /Simular Entrada/i });
    fireEvent.click(validateButton);

    await waitFor(() => {
      expect(validateGatePassTokenMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            token: "token-teste-jwt-123",
          }),
        }),
      );
    });
  });

  it("o botão Key pede a chave ao servidor, que não vem na listagem", async () => {
    listTurnstileDevicesMock.mockResolvedValue([sampleDevice]);
    listAccessLogsMock.mockResolvedValue([]);
    listAccessCardsMock.mockResolvedValue([]);
    getCampusVsClassroomReconciliationMock.mockResolvedValue(emptyRecon);
    revealTurnstileDeviceApiKeyMock.mockResolvedValue({ apiKey: "KEY-ABCDEF0123452345" });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    const CatracasPage = await loadCatracasPage();
    renderRoute(CatracasPage);

    const keyButton = await screen.findByTitle(/Copiar API key .*…2345/);
    fireEvent.click(keyButton);

    await waitFor(() => {
      expect(revealTurnstileDeviceApiKeyMock).toHaveBeenCalledWith({
        data: { deviceId: "dev-1" },
      });
      expect(writeText).toHaveBeenCalledWith("KEY-ABCDEF0123452345");
    });
  });
});
