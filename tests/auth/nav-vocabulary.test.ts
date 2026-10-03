import { describe, expect, it } from "vitest";
import { higherEdLabel, withHigherEdVocabulary } from "@/features/auth/nav-vocabulary";
import { getPortalNavigation } from "@/features/auth/portal-engine";

describe("vocabulário do Ensino Superior", () => {
  it("troca aluno(s) por estudante(s), sem mexer no resto", () => {
    expect(higherEdLabel("Gestão de Alunos")).toBe("Gestão de Estudantes");
    expect(higherEdLabel("Matricular Aluno")).toBe("Matricular Estudante");
    expect(higherEdLabel("Alumni · Antigos Alunos")).toBe("Alumni · Antigos Estudantes");
    expect(higherEdLabel("Alumni")).toBe("Alumni");
  });

  it("mantém rotas e estrutura da navegação", () => {
    const groups = getPortalNavigation("Administrador");
    const renamed = withHigherEdVocabulary(groups);
    const paths = (gs: typeof groups) =>
      gs.flatMap((g) => g.items.flatMap((i) => [i.to, ...(i.children ?? []).map((c) => c.to)]));
    expect(paths(renamed)).toEqual(paths(groups));
    expect(JSON.stringify(renamed.map((g) => g.items.map((i) => i.label)))).not.toMatch(/Alunos/);
  });
});
