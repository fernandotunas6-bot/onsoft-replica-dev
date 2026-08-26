import { describe, expect, it } from "vitest";
import {
  calculateFinalDisciplineAverage,
  calculateTrimesterAverage,
  normalizeGrade,
} from "./assessment";

describe("cálculos oficiais base", () => {
  it("calcula MT = (MACT + NPT) / 2", () => {
    expect(calculateTrimesterAverage(14, 10)).toBe(12);
  });

  it("calcula MFD = (MT1 + MT2 + MT3) / 3", () => {
    expect(calculateFinalDisciplineAverage(12, 14, 16)).toBe(14);
  });

  it("não calcula com nota ausente", () => {
    expect(calculateTrimesterAverage(14, null)).toBeNull();
  });

  it("rejeita nota fora de 0-20", () => {
    expect(() => normalizeGrade(21)).toThrow(RangeError);
  });
});
