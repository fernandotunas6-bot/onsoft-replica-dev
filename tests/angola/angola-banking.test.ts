import { describe, expect, it } from "vitest";
import {
  angolaBankLabelFromIban,
  formatAngolaIban,
  validateAngolaIban,
} from "@/lib/angola-banking";

describe("validateAngolaIban", () => {
  it("valida comprimento e prefixo AO", () => {
    const sample = "AO20004430156278343694804";
    const result = validateAngolaIban(sample);
    expect(result.ok).toBe(true);
    expect(result.compact).toBe(sample);
    expect(formatAngolaIban(sample)).toContain("AO20");
  });

  it("rejeita IBAN curto", () => {
    expect(validateAngolaIban("AO123").ok).toBe(false);
  });
});

describe("angolaBankLabelFromIban", () => {
  it("resolve rótulo quando o código é conhecido", () => {
    expect(angolaBankLabelFromIban("AO20004430156278343694804")).toContain("BAI");
    expect(angolaBankLabelFromIban("AO20005930156278343694804")).toContain("BMA");
    expect(angolaBankLabelFromIban("AO20000530156278343694804")).toContain("BCI");
    expect(angolaBankLabelFromIban("AO20004530156278343694804")).toContain("BE");
  });

  it("retorna null para códigos desconhecidos", () => {
    expect(angolaBankLabelFromIban("AO20999930156278343694804")).toBeNull();
  });
});
