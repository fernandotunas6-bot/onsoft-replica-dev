// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { paidAtFromPaidOn, paidOnDateSchema } from "@/features/finance/schemas";
import { paidOnIso } from "@/features/finance/late-fee";

/**
 * A confirmação manual de um pagamento Multicaixa registava sempre «pago hoje». Uma
 * família que pagou dentro da tolerância, confirmada pela tesouraria dias depois,
 * ficava com multa por atraso. A data do comprovativo passa a mandar na referência
 * (valor com a multa desse dia) e no recibo.
 */

const server = vi.hoisted(() => ({
  generateInvoicePaymentReference: vi.fn(),
  confirmManualMulticaixaPayment: vi.fn(),
}));

vi.mock("@/features/finance/server", () => server);
vi.mock("@/lib/school-date", () => ({ schoolTodayIso: () => "2026-10-22" }));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function referenceFor(amount: number) {
  return {
    multicaixa: {
      entity: "12345",
      reference: amount === 10000 ? "111 222 333" : "444 555 666",
      amountNumber: amount,
      amountFormatted: `${amount} Kz`,
    },
    lateFee: amount - 10000,
    mobileWallets: [],
  };
}

describe("data do pagamento no comprovativo", () => {
  it("aceita uma data real até hoje e recusa o futuro", () => {
    expect(paidOnDateSchema.safeParse("2026-10-20").success).toBe(true);
    expect(paidOnDateSchema.safeParse("2026-10-22").success).toBe(true);
    expect(paidOnDateSchema.safeParse("2026-10-23").success).toBe(false);
    expect(paidOnDateSchema.safeParse("2026-02-30").success).toBe(false);
    expect(paidOnDateSchema.safeParse("20/10/2026").success).toBe(false);
  });

  it("o recibo fica com o dia escolhido, sem saltar de dia", () => {
    expect(paidOnIso(paidAtFromPaidOn("2026-10-20"))).toBe("2026-10-20");
  });
});

describe("confirmação manual no cartão da referência", () => {
  beforeEach(() => {
    server.generateInvoicePaymentReference.mockImplementation(
      ({ data }: { data: { paidOn?: string } }) =>
        // Hoje já passou a tolerância (multa de 1000 Kz); a 20/10 ainda não.
        Promise.resolve(referenceFor(data.paidOn === "2026-10-20" ? 10000 : 11000)),
    );
    server.confirmManualMulticaixaPayment.mockResolvedValue({ message: "ok" });
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  async function renderCard() {
    const { PaymentReferenceCard } =
      await import("@/features/finance/components/PaymentReferenceCard");
    render(
      <QueryClientProvider client={new QueryClient()}>
        <PaymentReferenceCard invoiceId="inv-1" invoiceNumber="FT 1" />
      </QueryClientProvider>,
    );
    return screen.findByLabelText("Data do pagamento no comprovativo");
  }

  it("sem mudar a data, confirma como hoje", async () => {
    await renderCard();
    fireEvent.click(await screen.findByRole("button", { name: /confirmar pagamento/i }));
    await waitFor(() => expect(server.confirmManualMulticaixaPayment).toHaveBeenCalled());
    const sent = server.confirmManualMulticaixaPayment.mock.calls[0][0].data;
    expect(sent.amount).toBe(11000);
    expect(sent).not.toHaveProperty("paidOn");
  });

  it("pago dentro da tolerância: sem multa e com a data do comprovativo", async () => {
    const date = await renderCard();
    fireEvent.change(date, { target: { value: "2026-10-20" } });
    await waitFor(() =>
      expect(server.generateInvoicePaymentReference).toHaveBeenCalledWith({
        data: { invoiceId: "inv-1", paidOn: "2026-10-20" },
      }),
    );
    await screen.findByText(/111 222 333/);
    fireEvent.click(screen.getByRole("button", { name: /confirmar pagamento/i }));
    await waitFor(() => expect(server.confirmManualMulticaixaPayment).toHaveBeenCalled());
    const sent = server.confirmManualMulticaixaPayment.mock.calls[0][0].data;
    expect(sent).toMatchObject({ amount: 10000, paidOn: "2026-10-20" });
  });
});
