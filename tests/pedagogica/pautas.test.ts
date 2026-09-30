import { describe, expect, it } from "vitest";
import {
  calculateTrimesterAverage,
  calculateFinalDisciplineAverage,
  calculateExamFinalGrade,
  deriveElectronicStatusClass,
  evaluateAngolanStatus,
  isGrade,
  normalizeGrade,
  roundGrade,
  formatGrade,
} from "@/features/pedagogica/components/pautas/assessment";
import {
  miniPautaDemo,
  finalPautaDemo,
  trimesterPautaDemo,
  examPautaDemo,
} from "./pautas-fixtures";

describe("isGrade", () => {
  it("aceita notas válidas (0-20)", () => {
    expect(isGrade(0)).toBe(true);
    expect(isGrade(10)).toBe(true);
    expect(isGrade(20)).toBe(true);
  });

  it("rejeita valores fora do intervalo e não-numéricos", () => {
    expect(isGrade(-1)).toBe(false);
    expect(isGrade(21)).toBe(false);
    expect(isGrade(NaN)).toBe(false);
    expect(isGrade(null)).toBe(false);
    expect(isGrade("10")).toBe(false);
  });
});

describe("normalizeGrade", () => {
  it("retorna null para valores nulos, indefinidos ou fora do intervalo", () => {
    expect(normalizeGrade(null)).toBeNull();
    expect(normalizeGrade(undefined)).toBeNull();
    expect(normalizeGrade(-1)).toBeNull();
    expect(normalizeGrade(21)).toBeNull();
    expect(normalizeGrade(NaN)).toBeNull();
  });

  it("retorna o valor original para notas válidas", () => {
    expect(normalizeGrade(0)).toBe(0);
    expect(normalizeGrade(10)).toBe(10);
    expect(normalizeGrade(20)).toBe(20);
  });
});

describe("roundGrade", () => {
  it("arredonda para 1 casa decimal por defeito", () => {
    expect(roundGrade(13.05)).toBe(13.1);
    expect(roundGrade(9.94)).toBe(9.9);
    expect(roundGrade(10.0)).toBe(10);
  });

  it("arredonda para 0 casas decimais quando pedido", () => {
    expect(roundGrade(13.5, 0)).toBe(14);
    expect(roundGrade(12.4, 0)).toBe(12);
  });
});

describe("formatGrade", () => {
  it("retorna string vazia para null/undefined", () => {
    expect(formatGrade(null)).toBe("");
    expect(formatGrade(undefined)).toBe("");
  });

  it("converte número para string", () => {
    expect(formatGrade(14)).toBe("14");
    expect(formatGrade(9.5)).toBe("9.5");
  });
});

describe("SIGA Pautas Angola - Contextos de Ensino e Decreto 424/25", () => {
  it("calculates trimester average MT = (MACT + NPT) / 2", () => {
    expect(calculateTrimesterAverage(14, 12)).toBe(13);
    expect(calculateTrimesterAverage(10, 8)).toBe(9);
    expect(calculateTrimesterAverage(null, 12)).toBeNull();
  });

  it("evaluates Angolan student status per cycle", () => {
    expect(evaluateAngolanStatus(14, 0, "primario")).toBe("TRANSITA");
    expect(evaluateAngolanStatus(8, 0, "primario")).toBe("NÃO TRANSITA");

    expect(evaluateAngolanStatus(11, 1, "i_ciclo")).toBe("TRANSITA");
    expect(evaluateAngolanStatus(11, 3, "i_ciclo")).toBe("NÃO TRANSITA");

    expect(evaluateAngolanStatus(9.5, 0, "ii_ciclo")).toBe("ADMITIDO A EXAME");
    expect(evaluateAngolanStatus(12, 0, "tecnico", 15)).toBe("APTO (PAP)");
    expect(evaluateAngolanStatus(12, 0, "tecnico", 8)).toBe("NÃO APTO (PAP)");
  });

  it("retorna string vazia quando MFD é null", () => {
    expect(evaluateAngolanStatus(null, 0, "primario")).toBe("");
    expect(evaluateAngolanStatus(null, 2, "i_ciclo")).toBe("");
  });

  it("validates document structures across all modes", () => {
    expect(miniPautaDemo.students.length).toBeGreaterThan(0);
    expect(trimesterPautaDemo.subjects.length).toBe(7);
    expect(finalPautaDemo.subjects.length).toBe(7);
    expect(examPautaDemo.students.length).toBeGreaterThan(0);
    expect(examPautaDemo.isTechnical).toBe(true);
  });

  it("calculates MFD over 3 trimesters by default, matching prior behaviour bit-for-bit", () => {
    expect(calculateFinalDisciplineAverage(12, 14, 16)).toBe(14);
    // Um trimestre em falta continua a impedir a MFD impressa — comportamento inalterado.
    expect(calculateFinalDisciplineAverage(12, 14, null)).toBeNull();
    expect(calculateFinalDisciplineAverage(12, 14, undefined)).toBeNull();
  });

  it("calculates MFD over 2 semesters for Ensino Superior (periodCount: 2), without requiring a non-existent 3rd term", () => {
    expect(calculateFinalDisciplineAverage(12, 14, null, 2)).toBe(13);
    expect(calculateFinalDisciplineAverage(12, 14, undefined, 2)).toBe(13);
    // Falta o 1º semestre: continua null, mesmo com periodCount 2.
    expect(calculateFinalDisciplineAverage(null, 14, null, 2)).toBeNull();
    // periodCount 2 ignora mt3 mesmo se vier preenchido (não deve entrar no cálculo).
    expect(calculateFinalDisciplineAverage(12, 14, 20, 2)).toBe(13);
  });
});

describe("calculateExamFinalGrade — NF = (MFD × 0.6) + (Exame × 0.4)", () => {
  it("calcula nota final com ambos os valores", () => {
    // NF = (12 × 0.6) + (14 × 0.4) = 7.2 + 5.6 = 12.8 → 13 (0 decimais)
    expect(calculateExamFinalGrade(12, 14)).toBe(13);
    // NF = (10 × 0.6) + (10 × 0.4) = 10
    expect(calculateExamFinalGrade(10, 10)).toBe(10);
  });

  it("retorna MFD quando exame é null", () => {
    expect(calculateExamFinalGrade(14, null)).toBe(14);
  });

  it("retorna exame quando MFD é null", () => {
    expect(calculateExamFinalGrade(null, 12)).toBe(12);
  });

  it("retorna null quando ambos são null", () => {
    expect(calculateExamFinalGrade(null, null)).toBeNull();
  });

  it("suporta pesos personalizados (ex: 70/30)", () => {
    // NF = (10 × 0.7) + (20 × 0.3) = 7 + 6 = 13
    expect(calculateExamFinalGrade(10, 20, 0.7)).toBe(13);
  });
});

describe("deriveElectronicStatusClass", () => {
  it("retorna classe destrutiva para estados negativos", () => {
    expect(deriveElectronicStatusClass("NÃO TRANSITA")).toContain("destructive");
    expect(deriveElectronicStatusClass("REPROVADO")).toContain("destructive");
    expect(deriveElectronicStatusClass("NÃO APTO (PAP)")).toContain("destructive");
    expect(deriveElectronicStatusClass("RETIDO")).toContain("destructive");
  });

  it("retorna classe verde para estados positivos", () => {
    expect(deriveElectronicStatusClass("TRANSITA")).toContain("success");
    expect(deriveElectronicStatusClass("APROVADO")).toContain("success");
    expect(deriveElectronicStatusClass("APTO (PAP)")).toContain("success");
  });

  it("retorna classe âmbar para estados intermédios (ex: ADMITIDO A EXAME)", () => {
    expect(deriveElectronicStatusClass("ADMITIDO A EXAME")).toContain("warning");
    expect(deriveElectronicStatusClass("RECURSO")).toContain("destructive");
  });

  it("retorna classe neutra para status indefinido", () => {
    expect(deriveElectronicStatusClass(undefined)).toBe("text-foreground");
    expect(deriveElectronicStatusClass("")).toBe("text-foreground");
  });

  it("é case-insensitive", () => {
    expect(deriveElectronicStatusClass("transita")).toContain("success");
    expect(deriveElectronicStatusClass("não transita")).toContain("destructive");
  });
});
