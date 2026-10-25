// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import { renderRoute, routeComponentOf } from "./_harness";
import type { ReceiptSummary } from "@/features/finance/server";

/**
 * Testes de `/financeiro/recibos`.
 *
 * O que importa fixar é a origem verificável do documento e o tratamento do
 * estorno: um recibo estornado não desaparece do ecrã, continua visível com o
 * motivo à vista.
 */

vi.setConfig({ testTimeout: 20_000 });

vi.mock("@tanstack/react-router", async () => (await import("./_harness")).reactRouterMock());
vi.mock("@/components/layout/AppShell", async () => (await import("./_harness")).appShellMock());

const listReceiptsMock = vi.fn();

vi.mock("@/features/finance/server", () => ({
  listReceipts: (input: unknown) => listReceiptsMock(input),
}));

const issued: ReceiptSummary = {
  id: "rec-1",
  receipt_number: "REC/2026/0001",
  amount: 45000,
  paid_on: "2026-10-10",
  payment_method: "multicaixa_express",
  status: "issued",
  external_id: "MCX-99881",
  reversed_at: null,
  reversal_reason: null,
  invoice_id: "inv-1",
  invoice_number: "FT/2026/0042",
  invoice_status: "paid",
  student_id: "stu-1",
  student_name: "Ana Tunas",
  student_number: "2026-0001",
};

const reversed: ReceiptSummary = {
  ...issued,
  id: "rec-2",
  receipt_number: "REC/2026/0002",
  amount: 30000,
  status: "reversed",
  reversed_at: "2026-10-12T10:00:00Z",
  reversal_reason: "Pagamento em duplicado",
  student_name: "Bruno Capita",
  student_number: "2026-0002",
};

async function loadPage(): Promise<ComponentType> {
  const mod = await import("@/routes/financeiro.recibos");
  return routeComponentOf(mod);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("/financeiro/recibos", () => {
  it("mostra o estado vazio quando não há recibos emitidos", async () => {
    listReceiptsMock.mockResolvedValue([]);

    const Page = await loadPage();
    renderRoute(Page);

    expect(screen.getByText(/A carregar recibos/)).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText("Ainda não existem recibos emitidos")).toBeDefined();
    });
  });

  it("apresenta número, pagador, factura de origem e método de cada recibo", async () => {
    listReceiptsMock.mockResolvedValue([issued]);

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByText("REC/2026/0001")).toBeDefined();
    });
    expect(screen.getByText("Ana Tunas")).toBeDefined();
    expect(screen.getByText("2026-0001")).toBeDefined();
    // A factura liquidada é a origem verificável do recibo.
    expect(screen.getByText("FT/2026/0042")).toBeDefined();
    expect(screen.getByText("Multicaixa Express")).toBeDefined();
    expect(screen.getByText("Emitido")).toBeDefined();
  });

  it("mantém o recibo estornado visível, com o motivo à vista", async () => {
    listReceiptsMock.mockResolvedValue([reversed]);

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByText("REC/2026/0002")).toBeDefined();
    });
    expect(screen.getByText("Estornado")).toBeDefined();
    expect(screen.getByText("Pagamento em duplicado")).toBeDefined();
  });

  it("pesquisa por número, aluno ou factura sem perder os restantes recibos", async () => {
    listReceiptsMock.mockResolvedValue([issued, reversed]);

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByText("REC/2026/0001")).toBeDefined();
    });

    fireEvent.change(screen.getByLabelText("Pesquisar recibos"), {
      target: { value: "Bruno" },
    });

    await waitFor(() => {
      expect(screen.queryByText("REC/2026/0001")).toBeNull();
    });
    expect(screen.getByText("REC/2026/0002")).toBeDefined();

    // Limpar a pesquisa devolve a lista completa: o filtro é do ecrã, não
    // uma nova consulta que possa perder dados.
    fireEvent.change(screen.getByLabelText("Pesquisar recibos"), { target: { value: "" } });
    await waitFor(() => {
      expect(screen.getByText("REC/2026/0001")).toBeDefined();
    });
    expect(listReceiptsMock).toHaveBeenCalledTimes(1);
  });

  it("mostra o erro quando os recibos não carregam", async () => {
    listReceiptsMock.mockRejectedValue(new Error("Sem permissão para consultar recibos."));

    const Page = await loadPage();
    renderRoute(Page);

    await waitFor(() => {
      expect(screen.getByText("Sem permissão para consultar recibos.")).toBeDefined();
    });
  });
});
