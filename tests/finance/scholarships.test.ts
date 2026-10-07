import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  discountAmountFor,
  effectiveDiscountPercent,
  scholarshipInForce,
  scholarshipPercentFor,
} from "@/features/finance/scholarships";

const bolsa = (extra: Record<string, unknown> = {}) => ({
  percent: 50,
  scope: "tuition",
  valid_from: "2026-09-01",
  valid_until: "2027-07-31",
  revoked_at: null,
  ...extra,
});

describe("bolsas de estudo", () => {
  it("só em vigor entre as datas e se não foi revogada", () => {
    expect(scholarshipInForce(bolsa(), "2026-08-31")).toBe(false);
    expect(scholarshipInForce(bolsa(), "2026-09-01")).toBe(true);
    expect(scholarshipInForce(bolsa(), "2027-08-01")).toBe(false);
    expect(scholarshipInForce(bolsa({ valid_until: null }), "2030-01-01")).toBe(true);
    expect(scholarshipInForce(bolsa({ revoked_at: "2026-10-01T00:00:00Z" }), "2026-10-05")).toBe(
      false,
    );
  });

  it("«só propinas» não desconta a matrícula; «todas as taxas» desconta", () => {
    expect(scholarshipPercentFor([bolsa()], "tuition", "2026-10-05")).toBe(50);
    expect(scholarshipPercentFor([bolsa()], "enrollment", "2026-10-05")).toBe(0);
    expect(scholarshipPercentFor([bolsa()], null, "2026-10-05")).toBe(0);
    expect(scholarshipPercentFor([bolsa({ scope: "all" })], "enrollment", "2026-10-05")).toBe(50);
  });

  it("irmãos e bolsa não se somam: fica o maior", () => {
    expect(effectiveDiscountPercent(10, 50)).toBe(50);
    expect(effectiveDiscountPercent(10, 0)).toBe(10);
    expect(effectiveDiscountPercent(0, 0)).toBe(0);
    expect(effectiveDiscountPercent(10, 150)).toBe(100);
  });

  it("valor do desconto arredondado ao cêntimo", () => {
    expect(discountAmountFor(25_000, 50)).toBe(12_500);
    expect(discountAmountFor(33_333.33, 15)).toBe(5_000);
    expect(discountAmountFor(1000, 0)).toBe(0);
  });

  it("a tabela é só do servidor", () => {
    const sql = readFileSync("supabase/migrations/20261005160000_student_scholarships.sql", "utf8");
    expect(sql).toContain("FORCE ROW LEVEL SECURITY");
    expect(sql).toMatch(
      /REVOKE ALL ON public\.student_scholarships FROM PUBLIC, anon, authenticated/,
    );
    expect(sql).not.toMatch(/CREATE POLICY/);
  });
});
