import { describe, expect, it } from "vitest";
import {
  gatewayChargeState,
  invoiceState,
  paymentPlanState,
  receiptState,
} from "@/features/finance/payment-states";

const hoje = "2026-10-24";

describe("estado da fatura", () => {
  it("distingue por pagar, paga em parte e paga", () => {
    expect(
      invoiceState({ status: "issued", total: 10_000, paid: 0, dueOn: "2026-11-01" }, hoje).label,
    ).toBe("Por pagar");
    expect(
      invoiceState({ status: "partial", total: 10_000, paid: 4_000, dueOn: "2026-11-01" }, hoje),
    ).toEqual({
      status: "partial",
      label: "Paga em parte",
    });
    expect(
      invoiceState({ status: "paid", total: 10_000, paid: 10_000, dueOn: "2026-10-01" }, hoje)
        .status,
    ).toBe("paid");
  });

  it("vencida mostra se já entrou parte do dinheiro", () => {
    expect(
      invoiceState({ status: "partial", total: 10_000, paid: 4_000, dueOn: "2026-10-01" }, hoje),
    ).toEqual({
      status: "overdue",
      label: "Vencida · paga em parte",
    });
  });

  it("anulada nunca aparece como dívida", () => {
    expect(
      invoiceState({ status: "void", total: 10_000, paid: 0, dueOn: "2026-10-01" }, hoje).status,
    ).toBe("cancelled");
  });
});

describe("estado da transacção e do plano", () => {
  it("nada aparece como pago antes de o fornecedor confirmar", () => {
    for (const status of [
      "pending",
      "settling",
      "needs_review",
      "mismatch",
      "failed",
      "expired",
      "desconhecido",
    ]) {
      expect(gatewayChargeState(status).status, status).not.toBe("paid");
    }
    expect(gatewayChargeState("paid").status).toBe("paid");
    expect(paymentPlanState("pending_gateway").label).toBe("A aguardar confirmação");
    expect(paymentPlanState("desconhecido").status).not.toBe("paid");
  });

  it("recibo estornado não conta como confirmado", () => {
    expect(receiptState("reversed")).toEqual({ status: "refunded", label: "Estornado" });
    expect(receiptState("issued").status).toBe("paid");
  });
});
