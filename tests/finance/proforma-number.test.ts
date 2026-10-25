import { describe, expect, it } from "vitest";
import { proformaNumber } from "@/features/finance/proforma-receipts";

describe("número da proforma", () => {
  it("usa a data de Luanda, não a do UTC", () => {
    // 31/12 às 23h30 UTC já é 1/1 em Luanda (UTC+1).
    expect(proformaNumber(new Date("2026-12-31T23:30:00Z"))).toMatch(/^FP-2027\/0101-[A-Z2-9]{4}$/);
  });

  it("não se repete entre proformas do mesmo dia", () => {
    const agora = new Date("2026-10-25T10:00:00Z");
    const numeros = new Set(Array.from({ length: 200 }, () => proformaNumber(agora)));
    expect(numeros.size).toBeGreaterThan(195);
  });
});
