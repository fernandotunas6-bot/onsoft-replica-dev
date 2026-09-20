import { describe, expect, it } from "vitest";
import {
  brandHexToCssVars,
  contrastRatio,
  foregroundForBackground,
  isReadableBrandColor,
  isValidBrandHex,
  normalizeBrandHex,
} from "@/lib/brand-tokens";

describe("brand-tokens", () => {
  it("normalizes and validates hex colors", () => {
    expect(normalizeBrandHex("#2563eb")).toBe("#2563EB");
    expect(isValidBrandHex("#GG0000")).toBe(false);
    expect(isValidBrandHex("2563EB")).toBe(false);
  });

  it("rejects mid-tone primaries that fail WCAG AA for auto text", () => {
    // Zona em que branco e preto falham o contraste ≥ 4.5:1
    expect(isReadableBrandColor("#777777")).toBe(false);
    expect(isReadableBrandColor("#1D4ED8")).toBe(true);
    expect(contrastRatio("#FFFFFF", "#1D4ED8")).toBeGreaterThanOrEqual(4.5);
  });

  it("picks readable foreground for brand backgrounds", () => {
    expect(foregroundForBackground("#1D4ED8")).toBe("#FFFFFF");
    expect(foregroundForBackground("#F8FAFC")).toBe("#0A0A0A");
  });

  it("maps brand hex to primary CSS tokens", () => {
    const vars = brandHexToCssVars("#1D4ED8", "#0F172A", false);
    expect(vars["--primary"]).toBe("#1D4ED8");
    expect(vars["--primary-foreground"]).toBe("#FFFFFF");
    expect(vars["--sidebar"]).toBe("#0F172A");
    expect(vars["--ring"]).toBe("#1D4ED8");
  });
});
