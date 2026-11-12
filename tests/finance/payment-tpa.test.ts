import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mapPaymentMethodForLedger, paymentMethodLabel } from "@/features/finance/payment-method";
import { lateFeeChannelOfLedgerMethod } from "@/features/finance/late-fee";
import { recordInvoicePaymentInputSchema } from "@/features/finance/schemas";

/**
 * Pagamento por TPA: o funcionário passa o cartão do cliente no terminal do banco e
 * regista na Tesouraria o valor pago. Fica no livro como `card` (o valor que a base
 * aceita), não entra na gaveta e conta como canal electrónico para a multa.
 */
const rota = (nome: string) => readFileSync(join(process.cwd(), "src/routes", nome), "utf8");

describe("pagamento por TPA", () => {
  it("o servidor aceita o método e grava-o como cartão", () => {
    expect(
      recordInvoicePaymentInputSchema.parse({
        invoiceId: "00000000-0000-4000-8000-000000000001",
        amount: 25000,
        method: "tpa",
      }).method,
    ).toBe("tpa");
    expect(mapPaymentMethodForLedger("tpa")).toBe("card");
    expect(lateFeeChannelOfLedgerMethod(mapPaymentMethodForLedger("tpa"))).toBe("electronic");
  });

  it("Facturas e Caixa oferecem «TPA (cartão)» ao receber", () => {
    const faturas = rota("faturas.tsx");
    expect(faturas).toMatch(/"Numerário",\s+"TPA \(cartão\)",/);
    expect(faturas).toMatch(/"TPA \(cartão\)": "tpa"/);
    expect(faturas).toMatch(/Em atraso: TPA, Multicaixa Express e Unitel Money levam a multa/);
    expect(rota("financeiro.tsx")).toMatch(/"TPA \(cartão\)": "tpa",/);
  });

  it("os movimentos mostram o nome do método, não o código gravado", () => {
    expect(paymentMethodLabel("cash")).toBe("Numerário");
    expect(paymentMethodLabel("card")).toBe("Cartão (TPA / Multicaixa)");
    expect(paymentMethodLabel("multicaixa_express")).toBe("Multicaixa Express");
    expect(paymentMethodLabel("bank_transfer")).toBe("Transferência");
    expect(paymentMethodLabel("desconhecido")).toBe("desconhecido");
    expect(paymentMethodLabel(null)).toBe("");
    expect(rota("financeiro.tsx")).toMatch(/metodo: paymentMethodLabel\(entry\.method\)/);
  });
});
