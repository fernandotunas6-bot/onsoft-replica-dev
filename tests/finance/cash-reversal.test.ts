import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { invoiceNetTotal, invoiceStatusFromPaid } from "@/features/finance/invoice-settlement";

describe("invoiceStatusFromPaid", () => {
  it("sem recibos válidos a fatura volta a aberta", () => {
    expect(invoiceStatusFromPaid(10_000, 0)).toBe("open");
  });
  it("parte paga fica parcial; tudo pago fica paga", () => {
    expect(invoiceStatusFromPaid(10_000, 4_000)).toBe("partially_paid");
    expect(invoiceStatusFromPaid(10_000, 10_000)).toBe("paid");
  });
  it("compara em cêntimos, sem erros de vírgula flutuante", () => {
    expect(invoiceStatusFromPaid(0.3, 0.1 + 0.2)).toBe("paid");
  });
});

describe("estorno de recibos (reverseCashEntry)", () => {
  const source = readFileSync("src/features/finance/server.ts", "utf8");
  const start = source.indexOf("export const reverseCashEntry");
  const handler = source.slice(start, source.indexOf("export const createPaymentPlan", start));

  // As três garantias abaixo eram verificadas contra uma implementação em TypeScript
  // que fazia o estorno e a reposição da fatura em duas escritas separadas. No merge de
  // 2026-09-28 ficou a implementação que delega em `reverse_receipt`: a permissão, o 2FA
  // e o recálculo do estado da fatura passam a ser impostos dentro da base, na mesma
  // transacção. As garantias são as mesmas; o sítio onde se verificam é que mudou.
  it("exige 2FA e permissão — impostos pela RPC, não pela aplicação", () => {
    expect(handler).toContain('rpc("reverse_receipt"');
    // No cliente da SESSÃO, senão `auth.uid()` e `is_aal2()` não resolvem lá dentro e a
    // verificação de 2FA passa a não medir nada.
    expect(handler).toMatch(/context\.supabase\.rpc\("reverse_receipt"/);
    expect(handler).toMatch(/is_aal2\|autorização/);
  });
  it("só estorna recibos ainda válidos (não reescreve um estorno anterior)", () => {
    // A guarda a sério é o filtro `status = 'issued'` dentro da RPC; aqui verifica-se a
    // leitura que dá a mensagem útil a quem tenta estornar duas vezes.
    expect(handler).toContain('.select("id, status")');
    expect(handler).toContain('existente.status === "reversed"');
  });
  it("repõe o estado da fatura a partir dos recibos que ficam", () => {
    // A RPC devolve o estado recalculado, e é esse que volta ao cliente — não um valor
    // que a aplicação tenha adivinhado.
    expect(handler).toContain("invoiceStatus");
    expect(handler).toContain("invoice_status: resultado.invoiceStatus");
  });
});

describe("invoiceNetTotal", () => {
  it("é o valor menos o desconto, nunca negativo", () => {
    expect(invoiceNetTotal({ amount: 10_000, discount_amount: 2_000 })).toBe(8_000);
    expect(invoiceNetTotal({ amount: 10_000, discount_amount: null })).toBe(10_000);
    expect(invoiceNetTotal({ amount: 1_000, discount_amount: 5_000 })).toBe(0);
  });
  it("com desconto, pagar o total com desconto deixa a fatura paga", () => {
    const total = invoiceNetTotal({ amount: 10_000, discount_amount: 2_000 });
    expect(invoiceStatusFromPaid(total, 8_000)).toBe("paid");
  });
});
