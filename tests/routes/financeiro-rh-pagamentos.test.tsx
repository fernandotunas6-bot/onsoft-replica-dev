// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import { renderRoute, routeComponentOf } from "./_harness";

/**
 * Testes de montagem e render de `/financeiro/rh/pagamentos`.
 *
 * Valida as ordens de pagamento salarial:
 * 1. Transição de loading para carregado com a lista de ordens.
 * 2. Estado vazio de folhas aprovadas e de ordens.
 * 3. Selecção de uma ordem: indicadores e "Configurar destino" num item
 *    bloqueado — guardar o destino chama `upsertHrPaymentDestination` com o
 *    rascunho completo e depois ressincroniza o lote.
 * 4. Confirmação de pagamento de um item autorizado: o botão de confirmar
 *    fica desactivado até a referência ter pelo menos 3 caracteres.
 * 5. "Autorizar ordem" só aparece sem itens bloqueados.
 */

const listHrPayrollRunsMock = vi.fn();
const listPayrollPaymentBatchesMock = vi.fn();
const getPayrollPaymentBatchDetailMock = vi.fn();
const createPayrollPaymentBatchMock = vi.fn();
const refreshPayrollPaymentBatchMock = vi.fn();
const authorizePayrollPaymentBatchMock = vi.fn();
const upsertHrPaymentDestinationMock = vi.fn();
const confirmPayrollPaymentItemMock = vi.fn();

vi.setConfig({ testTimeout: 20_000 });

vi.mock("@tanstack/react-router", async () => (await import("./_harness")).reactRouterMock());
vi.mock("@/components/layout/AppShell", async () => (await import("./_harness")).appShellMock());

vi.mock("@/features/hr/server", () => ({
  listHrPayrollRuns: () => listHrPayrollRunsMock(),
}));

vi.mock("@/features/hr/payments", () => ({
  listPayrollPaymentBatches: () => listPayrollPaymentBatchesMock(),
  getPayrollPaymentBatchDetail: (input: unknown) => getPayrollPaymentBatchDetailMock(input),
  createPayrollPaymentBatch: (input: unknown) => createPayrollPaymentBatchMock(input),
  refreshPayrollPaymentBatch: (input: unknown) => refreshPayrollPaymentBatchMock(input),
  authorizePayrollPaymentBatch: (input: unknown) => authorizePayrollPaymentBatchMock(input),
  upsertHrPaymentDestination: (input: unknown) => upsertHrPaymentDestinationMock(input),
  confirmPayrollPaymentItem: (input: unknown) => confirmPayrollPaymentItemMock(input),
}));

const sampleBatch = {
  id: "batch-1",
  payroll_run_id: "run-1",
  batch_number: "ORD-2026-08",
  method: "transfer",
  status: "awaiting_authorization",
  total_amount_kz: 480000,
  payable_count: 1,
  blocked_count: 1,
  prepared_at: "2026-08-28T00:00:00Z",
  prepared_by: "user-1",
  authorized_at: null,
  authorized_by: null,
};

const blockedItem = {
  id: "item-blocked",
  payroll_item_id: "pi-1",
  employment_id: "emp-1",
  beneficiary_name: "Nelson Costa",
  destination_label: null,
  amount_kz: 200000,
  status: "blocked",
  block_reason: "Sem destino configurado",
  provider_reference: null,
  failure_reason: null,
  paid_at: null,
  cash_expense_id: null,
};

const authorizedItem = {
  id: "item-authorized",
  payroll_item_id: "pi-2",
  employment_id: "emp-2",
  beneficiary_name: "Sara Ferreira",
  destination_label: "IBAN ****1234",
  amount_kz: 280000,
  status: "authorized",
  block_reason: null,
  provider_reference: null,
  failure_reason: null,
  paid_at: null,
  cash_expense_id: null,
};

async function loadPage(): Promise<ComponentType> {
  const mod = await import("@/routes/financeiro.rh.pagamentos");
  return routeComponentOf(mod);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("/financeiro/rh/pagamentos", () => {
  it("mostra loading e depois a lista de ordens carregadas", async () => {
    listHrPayrollRunsMock.mockResolvedValue([]);
    listPayrollPaymentBatchesMock.mockResolvedValue([sampleBatch]);

    const Page = await loadPage();
    renderRoute(Page);

    expect(screen.getByText(/A carregar ordens/)).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText("ORD-2026-08")).toBeDefined();
    });
  });

  it("mostra os estados vazios de folhas aprovadas e de ordens", async () => {
    listHrPayrollRunsMock.mockResolvedValue([]);
    listPayrollPaymentBatchesMock.mockResolvedValue([]);

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByText("Nenhuma folha aprovada disponível")).toBeDefined();
    });
    // Query independente (lote de ordens) — resolve no seu próprio tempo.
    await waitFor(() => {
      expect(screen.getByText("Ainda não existem ordens salariais")).toBeDefined();
    });
    expect(screen.getByText("Nenhuma ordem seleccionada")).toBeDefined();
  });

  it("mostra os indicadores e permite configurar o destino de um item bloqueado", async () => {
    listHrPayrollRunsMock.mockResolvedValue([]);
    listPayrollPaymentBatchesMock.mockResolvedValue([sampleBatch]);
    getPayrollPaymentBatchDetailMock.mockResolvedValue({
      batch: sampleBatch,
      items: [blockedItem, authorizedItem],
    });
    upsertHrPaymentDestinationMock.mockResolvedValue({ saved: true });
    refreshPayrollPaymentBatchMock.mockResolvedValue({ refreshed: true });

    const Page = await loadPage();
    renderRoute(Page);

    fireEvent.click(await screen.findByText("ORD-2026-08"));

    await waitFor(() => {
      expect(screen.getByText("Nelson Costa")).toBeDefined();
    });
    expect(getPayrollPaymentBatchDetailMock).toHaveBeenCalledWith({ data: { batchId: "batch-1" } });

    fireEvent.click(screen.getByRole("button", { name: "Configurar destino" }));

    const ibanInput = await screen.findByLabelText("IBAN do beneficiário");
    fireEvent.change(ibanInput, { target: { value: "AO06004400001234567890123" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar destino" }));

    await waitFor(() => {
      expect(upsertHrPaymentDestinationMock).toHaveBeenCalledWith({
        data: {
          employmentId: "emp-1",
          beneficiaryName: "Nelson Costa",
          method: "transfer",
          bankName: "",
          iban: "AO06004400001234567890123",
          accountNumber: "",
          destinationReference: "",
        },
      });
    });
    // Guardar o destino ressincroniza o lote automaticamente.
    await waitFor(() => {
      expect(refreshPayrollPaymentBatchMock).toHaveBeenCalledWith({
        data: { batchId: "batch-1" },
      });
    });
  });

  it("o botão de confirmar pagamento fica desactivado até a referência ter 3+ caracteres", async () => {
    listHrPayrollRunsMock.mockResolvedValue([]);
    listPayrollPaymentBatchesMock.mockResolvedValue([{ ...sampleBatch, status: "authorized" }]);
    getPayrollPaymentBatchDetailMock.mockResolvedValue({
      batch: { ...sampleBatch, status: "authorized" },
      items: [authorizedItem],
    });

    const Page = await loadPage();
    renderRoute(Page);

    fireEvent.click(await screen.findByText("ORD-2026-08"));
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar pago" }));

    const confirmButton = await screen.findByRole("button", {
      name: "Confirmar e lançar no caixa",
    });
    expect(confirmButton).toHaveProperty("disabled", true);

    const referenceInput = screen.getByLabelText("Referência do pagamento salarial");
    fireEvent.change(referenceInput, { target: { value: "TRF-001" } });
    expect(confirmButton).toHaveProperty("disabled", false);

    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(confirmPayrollPaymentItemMock).toHaveBeenCalledWith({
        data: {
          paymentItemId: "item-authorized",
          result: "paid",
          reference: "TRF-001",
          failureReason: "",
        },
      });
    });
  });

  it("só mostra 'Autorizar ordem' quando não há itens bloqueados", async () => {
    listHrPayrollRunsMock.mockResolvedValue([]);
    listPayrollPaymentBatchesMock.mockResolvedValue([sampleBatch]);
    getPayrollPaymentBatchDetailMock.mockResolvedValue({
      batch: sampleBatch,
      items: [blockedItem, authorizedItem],
    });

    const Page = await loadPage();
    renderRoute(Page);

    fireEvent.click(await screen.findByText("ORD-2026-08"));

    await waitFor(() => {
      expect(screen.getByText("Nelson Costa")).toBeDefined();
    });
    // Ainda há um item bloqueado — não autoriza.
    expect(screen.queryByRole("button", { name: "Autorizar ordem" })).toBeNull();
  });
});
