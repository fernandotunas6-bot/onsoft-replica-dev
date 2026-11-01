import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Força bruta sobre a chave de integração PayFlow: o limite tem de ser o
 * partilhado entre instâncias do Worker, não o contador em memória de cada uma.
 */
describe("liquidação PayFlow — limite de tentativas", () => {
  const source = readFileSync(
    resolve(__dirname, "../../src/routes/api/finance/payflow.settlement.tsx"),
    "utf8",
  );

  it("usa o limitador partilhado antes de verificar a chave", () => {
    const limit = source.indexOf("consumeRateLimit(");
    expect(limit).toBeGreaterThan(-1);
    expect(limit).toBeLessThan(source.indexOf("payflowSettlementAuthorized("));
  });

  it("não volta ao contador só em memória", () => {
    expect(source).not.toMatch(/\bcheckRateLimit\(|\brecordRateLimitAttempt\(/);
  });
});
