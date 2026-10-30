import { describe, expect, it } from "vitest";
import {
  receiptLikeTerm,
  receiptRegisterInputSchema,
} from "@/features/finance/receipt-register-filter";

describe("filtros do registo de recibos", () => {
  it("não permite wildcard SQL introduzido pelo utilizador", () => {
    expect(receiptLikeTerm("REC_%")).toBe("%REC\\_\\%%");
    expect(receiptLikeTerm("F\\T")).toBe("%F\\\\T%");
  });
  it("não aceita datas invertidas, estados nem métodos arbitrários", () => {
    expect(receiptRegisterInputSchema.safeParse({ from: "2026-10-30", to: "2026-10-01" }).success).toBe(false);
    expect(receiptRegisterInputSchema.safeParse({ status: "deleted" }).success).toBe(false);
    expect(receiptRegisterInputSchema.safeParse({ method: "wire-magic" }).success).toBe(false);
  });
  it("tem paginação limitada e permite pesquisas por processo", () => {
    expect(receiptRegisterInputSchema.safeParse({ pageSize: 1001 }).success).toBe(false);
    expect(receiptRegisterInputSchema.parse({ studentQuery: "000123" })).toMatchObject({
      studentQuery: "000123",
      page: 1,
      pageSize: 25,
    });
  });
});
