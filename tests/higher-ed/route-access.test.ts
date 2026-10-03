import { describe, expect, it } from "vitest";
import { canAccessPath } from "@/features/auth/access-policy";

describe("acesso ao Ensino Superior", () => {
  it("Administração e Secretaria entram; professor, aluno e encarregado não", () => {
    expect(canAccessPath("/pedagogica/superior", "Administrador")).toBe(true);
    expect(canAccessPath("/pedagogica/superior", "Secretaria")).toBe(true);
    expect(canAccessPath("/pedagogica/superior", "Professor")).toBe(false);
    expect(canAccessPath("/pedagogica/superior", "Aluno")).toBe(false);
    expect(canAccessPath("/pedagogica/superior", "Encarregado")).toBe(false);
  });

  it("pauta do Superior: professor e secretaria; aluno e encarregado não", () => {
    expect(canAccessPath("/pedagogica/pautas-superior", "Professor")).toBe(true);
    expect(canAccessPath("/pedagogica/pautas-superior", "Secretaria")).toBe(true);
    expect(canAccessPath("/pedagogica/pautas-superior", "Aluno")).toBe(false);
    expect(canAccessPath("/pedagogica/pautas-superior", "Encarregado")).toBe(false);
  });

  it("histórico académico é da secretaria", () => {
    expect(canAccessPath("/pedagogica/superior/historico", "Secretaria")).toBe(true);
    expect(canAccessPath("/pedagogica/superior/historico", "Professor")).toBe(false);
    expect(canAccessPath("/pedagogica/superior/historico", "Aluno")).toBe(false);
  });
});
