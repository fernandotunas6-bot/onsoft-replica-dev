import { describe, expect, it } from "vitest";
import { environmentForPath, SCHOOL_ENVIRONMENTS } from "@/features/auth/environments";
import { canAccessPath } from "@/features/auth/access-policy";

describe("ambientes do administrador", () => {
  it("marca o ambiente da página actual", () => {
    expect(environmentForPath("/")).toBe("admin");
    expect(environmentForPath("/financeiro")).toBe("admin");
    expect(environmentForPath("/pedagogica")).toBe("portal");
    expect(environmentForPath("/pedagogica/catalogo")).toBe("portal");
    expect(environmentForPath("/configuracoes/inicio")).toBe("setup");
    expect(environmentForPath("/configuracoes/boas-vindas")).toBe("setup");
  });

  it("o administrador da escola abre todos os ambientes", () => {
    for (const env of SCHOOL_ENVIRONMENTS) {
      expect(canAccessPath(env.path, "Administrador")).toBe(true);
    }
    expect(canAccessPath("/configuracoes/boas-vindas", "Administrador")).toBe(true);
  });

  it("a página de boas-vindas é só do administrador", () => {
    for (const role of ["Secretaria", "Tesouraria", "Professor", "Aluno", "Encarregado"]) {
      expect(canAccessPath("/configuracoes/boas-vindas", role)).toBe(false);
    }
  });
});
