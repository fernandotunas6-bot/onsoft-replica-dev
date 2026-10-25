import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TREASURY_DISCOUNT_LIMIT, assertDiscountWithinRole } from "@/features/finance/scholarships";

/**
 * Bolsas e descontos (§8, decidido a 25/10/2026): a Tesouraria dá até 25 %; acima disso,
 * e para mudar ou retirar o que está acima, só um Administrador.
 */
const fonte = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("limite de desconto por papel", () => {
  it("a Tesouraria dá até 25 %, inclusive", () => {
    expect(TREASURY_DISCOUNT_LIMIT).toBe(25);
    expect(() => assertDiscountWithinRole(["Tesouraria"], 25)).not.toThrow();
    expect(() => assertDiscountWithinRole(["Tesouraria"], 0, 10)).not.toThrow();
    expect(() => assertDiscountWithinRole(["Tesouraria"], 25.01)).toThrow(/até 25 %/);
    expect(() => assertDiscountWithinRole(["Tesouraria"], 100)).toThrow(/Administrador/);
  });

  it("baixar ou retirar uma bolsa acima do limite também é do Administrador", () => {
    expect(() => assertDiscountWithinRole(["Tesouraria"], 0, 100)).toThrow(/Administrador/);
  });

  it("o Administrador dá qualquer valor, também quando tem os dois papéis", () => {
    expect(() => assertDiscountWithinRole(["Administrador"], 100)).not.toThrow();
    expect(() => assertDiscountWithinRole(["Tesouraria", "Administrador"], 100, 50)).not.toThrow();
  });

  it("os três caminhos que gravam bolsas verificam, antes de escrever", () => {
    const contrato = fonte("src/features/finance/scholarship-server.ts");
    const set = contrato.slice(contrato.indexOf("export const setStudentScholarship"));
    expect(set.indexOf("assertDiscountWithinRole(")).toBeGreaterThan(0);
    expect(set.indexOf("assertDiscountWithinRole(")).toBeLessThan(set.indexOf(".update("));
    expect(set).toMatch(/assertDiscountWithinRole\([^)]*data\.percent, before\)/);

    const bolsas = fonte("src/features/finance/student-scholarship-server.ts");
    const grant = bolsas.slice(bolsas.indexOf("export const grantScholarship"));
    expect(grant.indexOf("assertDiscountWithinRole(")).toBeLessThan(grant.indexOf(".insert("));
    const revoke = bolsas.slice(bolsas.indexOf("export const revokeScholarship"));
    expect(revoke.indexOf("assertDiscountWithinRole(")).toBeGreaterThan(0);
    expect(revoke.indexOf("assertDiscountWithinRole(")).toBeLessThan(revoke.indexOf(".update("));
  });
});
