// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import {
  renderRoute,
  resetCurrentAccount,
  resetRouteLocation,
  routeComponentOf,
  setCurrentAccount,
  setRouteParams,
} from "./_harness";

/**
 * `/faturas/<id>` (SIGA Context Engine, contexto financeiro): a fatura que o
 * servidor devolve na escola activa, o aluno e os pagamentos e recibos.
 */

vi.setConfig({ testTimeout: 25_000 });

vi.mock("@tanstack/react-router", async () => (await import("./_harness")).reactRouterMock());
vi.mock("@/components/layout/AppShell", async () => (await import("./_harness")).appShellMock());
vi.mock("@/features/auth/use-current-account", async () =>
  (await import("./_harness")).currentAccountMock({ role: "Tesouraria" }),
);

const getInvoiceDetailMock = vi.fn();
vi.mock("@/features/finance/server", () => ({
  getInvoiceDetail: (args: unknown) => getInvoiceDetailMock(args),
}));

const FATURA = "33333333-3333-4333-8333-333333333333";
const ANA = "22222222-2222-4222-8222-222222222222";

const detail = {
  id: FATURA,
  schoolId: "school-a",
  number: "FT-2026/0299",
  description: "Propina de Outubro",
  competenceMonth: "2026-10",
  issuedOn: "2026-10-01",
  dueOn: "2026-10-10",
  amount: 50_000,
  discount: 5_000,
  penalty: 0,
  total: 45_000,
  paid: 20_000,
  openAmount: 25_000,
  state: { status: "overdue", label: "Vencida · paga em parte" },
  cancellationReason: null,
  student: { id: ANA, name: "Ana Paula Silva", registrationNumber: "2026-0142" },
  receipts: [
    {
      id: "r1",
      number: "RC-2026/0051",
      amount: 20_000,
      paidOn: "2026-10-08",
      method: "cash",
      state: { status: "paid", label: "Confirmado" },
      reversalReason: null,
    },
  ],
};

let Page: ComponentType;

beforeAll(async () => {
  Page = routeComponentOf(await import("@/routes/faturas_.$invoiceId"));
}, 60_000);

afterEach(() => {
  cleanup();
  getInvoiceDetailMock.mockReset();
  resetRouteLocation();
  resetCurrentAccount();
});

function open(role = "Tesouraria") {
  setRouteParams({ invoiceId: FATURA });
  setCurrentAccount({ role, roles: [role] });
  renderRoute(Page);
}

describe("/faturas/<id>", () => {
  it("mostra a fatura, o aluno e os recibos que a pagam", async () => {
    getInvoiceDetailMock.mockResolvedValue(detail);
    open();
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1, name: "Fatura FT-2026/0299" })).toBeDefined(),
    );
    expect(getInvoiceDetailMock).toHaveBeenCalledWith({ data: { invoiceId: FATURA } });
    expect(screen.getByText("Vencida · paga em parte")).toBeDefined();
    expect(screen.getByText("Falta pagar").nextElementSibling?.textContent).toMatch(/25[\s.]?000/);
    expect(screen.getByText("Ana Paula Silva")).toBeDefined();
    const receipts = screen.getByRole("region", { name: "Pagamentos e recibos" });
    expect(receipts.textContent).toContain("RC-2026/0051");
    expect(receipts.textContent).toContain("Confirmado");
    // A tesouraria não abre fichas de alunos: o nome aparece sem ligação.
    expect(screen.queryByRole("link", { name: "Ficha do aluno" })).toBeNull();
  });

  it("a administração vai da fatura ao financeiro do aluno", async () => {
    getInvoiceDetailMock.mockResolvedValue(detail);
    open("Administrador");
    await waitFor(() => expect(screen.getByText("Ana Paula Silva")).toBeDefined());
    expect(screen.getByRole("link", { name: "Financeiro do aluno" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Ficha do aluno" })).toBeDefined();
  });

  it("mostra as cobranças electrónicas só quando o servidor as devolve", async () => {
    getInvoiceDetailMock.mockResolvedValue({
      ...detail,
      charges: [
        {
          id: "c1",
          method: "Multicaixa Express",
          amount: 25_000,
          reference: null,
          state: { status: "failed", label: "Falhado" },
          message: "Telefone sem saldo",
          receiptNumber: null,
          createdAt: "2026-10-20",
        },
      ],
    });
    open();
    const charges = await screen.findByRole("region", { name: "Cobranças electrónicas" });
    expect(charges.textContent).toContain("Multicaixa Express");
    expect(charges.textContent).toContain("Falhado");
    expect(charges.textContent).toContain("Telefone sem saldo");
  });

  it("sem cobranças na resposta (secretaria), a secção não aparece", async () => {
    getInvoiceDetailMock.mockResolvedValue({ ...detail, charges: null });
    open("Administrador");
    await waitFor(() => expect(screen.getByText("Ana Paula Silva")).toBeDefined());
    expect(screen.queryByRole("region", { name: "Cobranças electrónicas" })).toBeNull();
  });

  it("sem pagamentos, diz que ainda não há", async () => {
    getInvoiceDetailMock.mockResolvedValue({ ...detail, receipts: [], paid: 0 });
    open();
    await waitFor(() =>
      expect(screen.getByText("Ainda não há pagamentos registados nesta fatura.")).toBeDefined(),
    );
  });

  it("uma fatura que o servidor não devolve mostra «Fatura não encontrada»", async () => {
    getInvoiceDetailMock.mockResolvedValue(null);
    open();
    await waitFor(() => expect(screen.getByText("Fatura não encontrada")).toBeDefined());
  });

  it("quem não abre as faturas não faz o pedido", async () => {
    open("Encarregado");
    expect(screen.getByText("Sem acesso às faturas")).toBeDefined();
    expect(getInvoiceDetailMock).not.toHaveBeenCalled();
  });
});
