import { describe, expect, it } from "vitest";
import { canAccessPath } from "@/features/auth/access-policy";

/**
 * Levantamento dos portais (22/10): o aluno tinha acesso por endereço a ecrãs de
 * gestão sem ligação no seu menu. Vê o que é seu no portal.
 */
describe("ecrãs de gestão fechados ao aluno", () => {
  it("o aluno não abre Pessoas, Alunos nem Arquivos", () => {
    for (const path of ["/pessoas", "/alunos", "/alunos/abc", "/arquivos"]) {
      expect(canAccessPath(path, "Aluno"), path).toBe(false);
    }
  });

  it("o que é do aluno continua aberto", () => {
    for (const path of ["/portal", "/pedagogica", "/financeiro", "/documentos", "/perfil"]) {
      expect(canAccessPath(path, "Aluno"), path).toBe(true);
    }
  });

  it("o encarregado mantém a ficha do educando (o chat abre-a)", () => {
    expect(canAccessPath("/alunos/abc", "Encarregado")).toBe(true);
    expect(canAccessPath("/faturas", "Encarregado")).toBe(false);
  });

  it("a gestão continua igual", () => {
    expect(canAccessPath("/alunos", "Secretaria")).toBe(true);
    expect(canAccessPath("/arquivos", "Professor")).toBe(true);
  });
});
