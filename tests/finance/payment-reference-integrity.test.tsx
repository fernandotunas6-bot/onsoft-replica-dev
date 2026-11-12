// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const api = vi.hoisted(() => ({
  generateInvoicePaymentReference: vi.fn(),
  confirmManualMulticaixaPayment: vi.fn(),
}));
const notices = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/features/finance/server", () => api);
vi.mock("@/lib/school-date", () => ({ schoolTodayIso: () => "2026-10-28" }));
vi.mock("@/lib/toast", () => ({ toast: notices }));
import { PaymentReferenceCard } from "@/features/finance/components/PaymentReferenceCard";
const reference = (amount = 11000) => ({
  multicaixa: {
    entity: "12345",
    reference: `REF-${amount}`,
    amountNumber: amount,
    amountFormatted: `${amount} Kz`,
    expiresAt: "30/10/2026",
  },
  lateFee: amount - 10000,
  mobileWallets: [],
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
let writeText = vi.fn();
beforeEach(() => {
  api.generateInvoicePaymentReference.mockReset().mockResolvedValue(reference());
  api.confirmManualMulticaixaPayment
    .mockReset()
    .mockResolvedValue({ message: "Valor registado.", receiptNumber: "RC-1" });
  notices.success.mockReset();
  notices.error.mockReset();
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = (id: string) => (
    <QueryClientProvider client={client}>
      <PaymentReferenceCard invoiceId={id} invoiceNumber={`FT-${id}`} />
    </QueryClientProvider>
  );
  const view = render(tree("invoice-1"));
  return { ...view, changeInvoice: () => view.rerender(tree("invoice-2")) };
}
async function ready() {
  await screen.findByText("REF-11000");
  return screen.getByRole("button", { name: /confirmar pagamento manualmente/i });
}

describe("cartão de pagamento — repetição, datas e saldo", () => {
  it("reutiliza a chave após falha de rede e impede nova confirmação após recibo aceite", async () => {
    api.confirmManualMulticaixaPayment.mockRejectedValueOnce(new Error("Ligação interrompida"));
    mount();
    fireEvent.click(await ready());
    await waitFor(() => expect(notices.error).toHaveBeenCalled());
    const first = api.confirmManualMulticaixaPayment.mock.calls[0][0].data;
    expect(first.idempotencyKey).toMatch(/^[a-f0-9-]{36}$/);
    fireEvent.click(screen.getByRole("button", { name: /confirmar pagamento manualmente/i }));
    await screen.findByText("Recibo RC-1");
    expect(api.confirmManualMulticaixaPayment.mock.calls[1][0].data.idempotencyKey).toBe(
      first.idempotencyKey,
    );
    expect(screen.queryByRole("button", { name: /confirmar pagamento manualmente/i })).toBeNull();
    expect(api.confirmManualMulticaixaPayment).toHaveBeenCalledTimes(2);
  });
  it("bloqueia confirmar/copiar o montante antigo enquanto recalcula a data do comprovativo", async () => {
    const next = deferred<ReturnType<typeof reference>>();
    api.generateInvoicePaymentReference
      .mockResolvedValueOnce(reference())
      .mockReturnValueOnce(next.promise);
    mount();
    await ready();
    fireEvent.change(screen.getByLabelText("Data do pagamento no comprovativo"), {
      target: { value: "2026-10-20" },
    });
    await screen.findByText("A actualizar o valor para a data escolhida…");
    expect(
      (screen.getByRole("button", { name: "Copiar montante" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: /confirmar pagamento manualmente/i,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(api.confirmManualMulticaixaPayment).not.toHaveBeenCalled();
    next.resolve(reference(10000));
    await screen.findByText("REF-10000");
    fireEvent.click(screen.getByRole("button", { name: /confirmar pagamento manualmente/i }));
    await waitFor(() =>
      expect(api.confirmManualMulticaixaPayment).toHaveBeenCalledWith({
        data: expect.objectContaining({
          amount: 10000,
          paidOn: "2026-10-20",
          idempotencyKey: expect.any(String),
        }),
      }),
    );
  });
  it("não usa silenciosamente hoje quando a data está vazia ou é futura", async () => {
    mount();
    await ready();
    for (const value of ["", "2026-10-29"]) {
      fireEvent.change(screen.getByLabelText("Data do pagamento no comprovativo"), {
        target: { value },
      });
      await screen.findByText("Indique uma data válida até hoje.");
      const button = screen.getByRole("button", {
        name: /confirmar pagamento manualmente/i,
      }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      fireEvent.click(button);
    }
    expect(api.confirmManualMulticaixaPayment).not.toHaveBeenCalled();
  });
  it("duplo clique durante o pedido confirma uma única vez", async () => {
    const payment = deferred<{ message: string; receiptNumber: string }>();
    api.confirmManualMulticaixaPayment.mockReturnValueOnce(payment.promise);
    mount();
    const button = await ready();
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(api.confirmManualMulticaixaPayment).toHaveBeenCalledTimes(1));
    payment.resolve({ message: "Registado.", receiptNumber: "RC-1" });
    await screen.findByText("Recibo RC-1");
  });
  it("mudar de factura desmonta a data e a referência anteriores", async () => {
    const next = deferred<ReturnType<typeof reference>>();
    const view = mount();
    await ready();
    fireEvent.change(screen.getByLabelText("Data do pagamento no comprovativo"), {
      target: { value: "2026-10-20" },
    });
    await waitFor(() => expect(api.generateInvoicePaymentReference).toHaveBeenCalledTimes(2));
    api.generateInvoicePaymentReference.mockReturnValueOnce(next.promise);
    view.changeInvoice();
    expect(screen.queryByText("REF-11000")).toBeNull();
    next.resolve(reference(20000));
    await screen.findByText("REF-20000");
    expect(
      (screen.getByLabelText("Data do pagamento no comprovativo") as HTMLInputElement).value,
    ).toBe("2026-10-28");
    fireEvent.click(screen.getByRole("button", { name: /confirmar pagamento manualmente/i }));
    await waitFor(() =>
      expect(api.confirmManualMulticaixaPayment).toHaveBeenCalledWith({
        data: expect.objectContaining({ invoiceId: "invoice-2", amount: 20000 }),
      }),
    );
  });
  it("só anuncia cópia depois de a área de transferência aceitar", async () => {
    const copy = deferred<void>();
    writeText.mockReturnValueOnce(copy.promise);
    mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Copiar referência" }));
    expect(notices.success).not.toHaveBeenCalled();
    copy.resolve();
    await waitFor(() =>
      expect(notices.success).toHaveBeenCalledWith("Referência copiado com sucesso!"),
    );
    writeText.mockRejectedValueOnce(new Error("Sem permissão"));
    fireEvent.click(screen.getByRole("button", { name: "Copiar montante" }));
    await waitFor(() =>
      expect(notices.error).toHaveBeenCalledWith(
        expect.stringContaining("Não foi possível copiar"),
      ),
    );
    expect(notices.success).toHaveBeenCalledTimes(1);
  });
  it("uma falha ao gerar referência permite tentar novamente", async () => {
    api.generateInvoicePaymentReference.mockRejectedValueOnce(new Error("Sem ligação"));
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Tentar novamente" }));
    await screen.findByText("REF-11000");
  });
});
