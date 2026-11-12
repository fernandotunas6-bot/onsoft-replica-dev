import { describe, expect, it } from "vitest";
import { schoolDateInDays } from "@/lib/school-date";

describe("schoolDateInDays", () => {
  it("conta a partir do dia de Luanda, não do UTC", () => {
    // 23:30 UTC de 10/10 já é 11/10 em Luanda (UTC+1).
    const lateNight = new Date("2026-10-10T23:30:00Z");
    expect(schoolDateInDays(15, lateNight)).toBe("2026-10-26");
    expect(new Date(lateNight.getTime() + 15 * 86400000).toISOString().slice(0, 10)).toBe(
      "2026-10-25",
    );
  });

  it("atravessa meses e aceita dias negativos", () => {
    const noon = new Date("2026-01-31T12:00:00Z");
    expect(schoolDateInDays(1, noon)).toBe("2026-02-01");
    expect(schoolDateInDays(-31, noon)).toBe("2025-12-31");
  });
});
