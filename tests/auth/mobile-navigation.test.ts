import { describe, expect, it } from "vitest";
import { getMobileNavigation, isMobileDestinationActive } from "@/features/auth/mobile-navigation";

describe("mobile navigation", () => {
  it("uses teaching destinations for professors instead of student administration", () => {
    const paths = getMobileNavigation("Professor").map((item) => item.to);
    expect(paths).toContain("/pedagogica");
    expect(paths).not.toContain("/alunos");
    expect(paths).not.toContain("/financeiro");
  });
  it("honours denied dashboard and module grants", () => {
    expect(
      getMobileNavigation("Administrador", {
        dashboard: "Nenhum",
        pessoas: "Nenhum",
        pedagogica: "Nenhum",
        financeiro: "Nenhum",
      }),
    ).toEqual([]);
  });
  it("provides academic destinations for students and guardians", () => {
    for (const role of ["Aluno", "Encarregado"] as const) {
      expect(getMobileNavigation(role).map((item) => item.to)).toContain("/pedagogica");
    }
  });
  it("recognises finance sibling routes without matching unrelated prefixes", () => {
    for (const path of [
      "/financeiro",
      "/financeiro/rh",
      "/faturas",
      "/tesouraria",
      "/relatorios/financeiros",
    ]) {
      expect(isMobileDestinationActive("/financeiro", path)).toBe(true);
    }
    expect(isMobileDestinationActive("/financeiro", "/faturas-outras")).toBe(false);
    expect(isMobileDestinationActive("/alunos", "/alunos/123")).toBe(true);
    expect(isMobileDestinationActive("/", "/alunos")).toBe(false);
  });
});
