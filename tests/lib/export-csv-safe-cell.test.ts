import { describe, expect, it } from "vitest";
import { safeCell } from "@/lib/export-csv";

describe("CSV: fórmulas neutralizadas, números intactos", () => {
  it.each(['=HYPERLINK("http://x")', "+1", "-2+3", "@SUM(A1)", "\t=1", "\r=1"])(
    "texto %j ganha apóstrofo",
    (value) => {
      expect(safeCell(value).startsWith(`"'`)).toBe(true);
    },
  );

  it("números negativos continuam números", () => {
    expect(safeCell(-500)).toBe('"-500"');
    expect(safeCell(0)).toBe('"0"');
  });

  it("aspas são duplicadas", () => {
    expect(safeCell('diz "olá"')).toBe('"diz ""olá"""');
  });
});
