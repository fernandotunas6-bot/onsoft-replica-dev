// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Bancos e Conciliação: cada cobrança do gateway leva à página da sua fatura
 * (`/faturas/<id>`, com os recibos e as cobranças), só para quem abre as faturas.
 */

const state = vi.hoisted(() => ({ role: "Tesouraria" }));

vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    params,
  }: {
    children: React.ReactNode;
    to: string;
    params?: Record<string, string>;
  }) => <a href={to.replace("$invoiceId", params?.invoiceId ?? "")}>{children}</a>,
}));
vi.mock("@/features/auth/use-current-account", () => ({
  useCurrentAccount: () => ({ role: state.role, grants: {} }),
}));
vi.mock("@/features/finance/appypay.functions", () => ({
  getAppyPayStatus: async () => ({ configured: true, environment: "sandbox" }),
  createInvoiceCharge: vi.fn(),
  reconcileOpenCharges: vi.fn(),
  listGatewayCharges: async () => [
    {
      id: "c1",
      invoice_id: "33333333-3333-4333-8333-333333333333",
      student_name: "Ana Paula Silva",
      method: "GPO",
      merchant_transaction_id: "MT-1",
      amount: 25_000,
      reference_entity: null,
      reference_number: null,
      status: "paid",
      status_message: null,
      receipt_number: "RC-2026/0051",
      created_at: "2026-10-20T09:00:00Z",
    },
  ],
}));

import { AppyPayPanel } from "@/features/finance/AppyPayPanel";

afterEach(() => {
  cleanup();
  state.role = "Tesouraria";
});

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AppyPayPanel />
    </QueryClientProvider>,
  );
}

describe("AppyPayPanel: cobrança → fatura", () => {
  it("a Tesouraria abre a fatura de cada cobrança", async () => {
    show();
    const link = await screen.findByRole("link", { name: "Ver fatura" });
    expect(link.getAttribute("href")).toBe("/faturas/33333333-3333-4333-8333-333333333333");
  });

  it("quem não abre as faturas não recebe a ligação", async () => {
    state.role = "Secretaria";
    show();
    await screen.findByText(/Ana Paula Silva/);
    expect(screen.queryByRole("link", { name: "Ver fatura" })).toBeNull();
  });
});
