import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSettingsDomain } from "@/features/school/settings-domains";

describe("domínios de configuração da escola", () => {
  it("cobrança sem nada gravado: sem multa, sem tolerância, sem desconto", () => {
    expect(parseSettingsDomain("billing", undefined)).toEqual({
      due_day: 10,
      late_fee_percent: 0,
      grace_days: 0,
      sibling_discount_percent: 0,
    });
  });

  it("um campo inválido não deita fora os outros e os limites são respeitados", () => {
    expect(
      parseSettingsDomain("billing", {
        due_day: 45,
        late_fee_percent: "3",
        grace_days: "abc",
        sibling_discount_percent: 150,
      }),
    ).toEqual({ due_day: 28, late_fee_percent: 3, grace_days: 0, sibling_discount_percent: 100 });
  });

  it("instituição só aceita naturezas conhecidas", () => {
    expect(parseSettingsDomain("institution", { school_type: "privada" }).school_type).toBe(
      "privada",
    );
    expect(parseSettingsDomain("institution", { school_type: "pirata" }).school_type).toBeNull();
  });

  it("académico: períodos só 2 ou 3, nota mínima entre 0 e 20", () => {
    const parsed = parseSettingsDomain("academic", { evaluation_periods: 7, passing_grade: 30 });
    expect(parsed.evaluation_periods).toBe(3);
    expect(parsed.passing_grade).toBe(20);
  });

  it("valor que não é objecto dá os valores por omissão", () => {
    expect(parseSettingsDomain("banking", "lixo").iban).toBe("");
    expect(parseSettingsDomain("preferences", [true])).toEqual({});
  });

  it("ecrã, cobrança e gateway leem a cobrança pelo mesmo registo", () => {
    for (const file of [
      "src/features/school/server.ts",
      "src/features/finance/server.ts",
      "src/features/finance/gateway-webhook-handler.ts",
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(
        /\["late_fee_percent"\]|\["sibling_discount_percent"\]|\["grace_days"\]/,
      );
    }
  });
});
