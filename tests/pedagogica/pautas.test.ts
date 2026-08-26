import { describe, expect, it } from "vitest";
import {
  calculateTrimesterAverage,
  calculateFinalDisciplineAverage,
  deriveElectronicStatusClass,
  evaluateAngolanStatus,
} from "@/features/pedagogica/components/pautas/assessment";
import {
  miniPautaDemo,
  finalPautaDemo,
  trimesterPautaDemo,
  examPautaDemo,
} from "@/features/pedagogica/components/pautas/pautas-demo";

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
