import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HIGHER_ED_FEES, higherEdFeeCodeForCategory } from "@/features/higher-ed/fees";

describe("emolumentos do Ensino Superior", () => {
  it("a categoria da fatura encontra o emolumento pelo nome", () => {
    expect(higherEdFeeCodeForCategory("Exame de recurso")).toBe("HE_RECURSO");
    expect(higherEdFeeCodeForCategory(" certidão de notas ")).toBe("HE_CERTIDAO");
    expect(higherEdFeeCodeForCategory("Mensalidade")).toBeNull();
    expect(new Set(HIGHER_ED_FEES.map((fee) => fee.code)).size).toBe(HIGHER_ED_FEES.length);
  });

  it("a fatura liga-se ao item pelo código e as outras categorias não apanham emolumentos", () => {
    const source = readFileSync("src/features/finance/server.ts", "utf8");
    const start = source.indexOf("export const issueInvoice");
    const body = source.slice(start, source.indexOf("export const", start + 1));
    expect(body).toContain('feeQuery.eq("code", feeCode)');
    expect(body).toContain('feeQuery.neq("kind", "service")');
  });
});
