import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
const warning = vi.hoisted(() => vi.fn());
vi.mock("@/lib/toast", () => ({ toast: { warning } }));
import { finishRecordedPayment } from "@/features/finance/finish-recorded-payment";
beforeEach(() => warning.mockReset());
describe("efeitos depois do recibo aceite", () => {
  it("falha do PDF não volta a apresentar o pagamento como falhado", async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const print = vi.fn().mockRejectedValue(new Error("Sem impressora"));
    await expect(
      finishRecordedPayment({ receiptNumber: "RC-1", refresh, print }),
    ).resolves.toBeUndefined();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(print).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledWith("Pagamento registado · RC-1", {
      description: expect.stringContaining("Movimentos de Caixa"),
    });
  });
  it("falha de cache ou excepção síncrona também preservam o recibo aceite", async () => {
    await expect(
      finishRecordedPayment({
        receiptNumber: "RC-2",
        refresh: () => {
          throw new Error("Cache indisponível");
        },
        print: () => {},
      }),
    ).resolves.toBeUndefined();
    expect(warning).toHaveBeenCalledWith("Pagamento registado · RC-2", {
      description: expect.stringContaining("Actualize a lista"),
    });
  });
  it("quando impressão e actualização passam, não mostra aviso", async () => {
    await finishRecordedPayment({ receiptNumber: "RC-3", refresh: () => {}, print: () => {} });
    expect(warning).not.toHaveBeenCalled();
  });
  it.each([
    "src/routes/faturas.tsx",
    "src/routes/financeiro.tsx",
    "src/routes/alunos/$studentId.tsx",
  ])("%s separa o pagamento dos efeitos e envia a chave", (file) => {
    const source = readFileSync(file, "utf8");
    const start = source.indexOf("const paid = await recordInvoicePayment(");
    const end = source.indexOf("await finishRecordedPayment(", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(source.slice(start, end)).toContain("idempotencyKey: paymentKey.keyFor(attempt)");
  });
});
