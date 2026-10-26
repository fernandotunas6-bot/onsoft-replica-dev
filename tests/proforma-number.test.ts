import { describe, expect, it } from "vitest";
import { proformaNumber } from "@/lib/school-date";

describe("proformaNumber", () => {
  it("usa data e hora de Luanda", () => {
    expect(proformaNumber(new Date("2026-12-31T23:30:05Z"))).toBe("FP-20270101-003005");
  });
});
