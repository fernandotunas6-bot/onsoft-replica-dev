import { describe, expect, it } from "vitest";
import { angolaProvinces, normalizeAngolaProvince } from "@/lib/angola-territory";

describe("angola territory", () => {
  it("uses the current 21-province administrative division", () => {
    expect(angolaProvinces).toHaveLength(21);
    expect(angolaProvinces).toContain("Icolo e Bengo");
    expect(angolaProvinces).toContain("Moxico Leste");
    expect(angolaProvinces).toContain("Cuando");
    expect(angolaProvinces).toContain("Cubango");
  });

  it("normalizes accents and casing without inventing provinces", () => {
    expect(normalizeAngolaProvince("huila")).toBe("Huíla");
    expect(normalizeAngolaProvince("  LUANDA ")).toBe("Luanda");
    expect(normalizeAngolaProvince("Província inexistente")).toBeNull();
  });
});
