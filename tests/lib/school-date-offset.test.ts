import { describe, expect, it } from "vitest";
import { schoolDateInDays } from "@/lib/school-date";

describe("hoje mais N dias na data de Luanda", () => {
  it("às 23:30 UTC já é o dia seguinte em Luanda", () => {
    const now = new Date("2026-10-10T23:30:00Z");
    expect(schoolDateInDays(0, now)).toBe("2026-10-11");
    expect(schoolDateInDays(15, now)).toBe("2026-10-26");
    expect(schoolDateInDays(-1, now)).toBe("2026-10-10");
  });
});
