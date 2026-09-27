import { describe, expect, it } from "vitest";
import { DEFAULT_FEE_ITEMS } from "@/features/finance/fee-plan-defaults";

describe("plano de propinas por omissão", () => {
  it("cria os itens obrigatórios sem preço inventado (0 = por definir)", () => {
    expect(DEFAULT_FEE_ITEMS.map((item) => item.kind)).toEqual(["tuition", "enrollment"]);
    for (const item of DEFAULT_FEE_ITEMS) expect(item.amount).toBe(0);
  });
});
