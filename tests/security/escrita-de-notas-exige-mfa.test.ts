import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type Politica = {
  tabela: string;
  politica: string;
  cmd: string;
  papeis: string;
  usando: string;
  verificando: string;
  modo?: string;
};

const retrato = JSON.parse(
  readFileSync(resolve(__dirname, "../../supabase/PRODUCTION_SNAPSHOT.json"), "utf8"),
) as { politicas: Politica[] };

/**
 * As três tabelas do modelo de notas com diário (o "modelo A"). Cada uma tinha um
 * par de políticas por comando — uma endurecida e uma de 20260903023500 — e
 * políticas permissivas combinam-se com OR, pelo que a fraca decidia.
 * Fechado em 20260924160000.
 */
const TABELAS_DE_NOTAS = ["gradebooks", "grade_items", "grade_scores"];
const ESCRITA = ["INSERT", "UPDATE", "DELETE", "ALL"];

// RESTRICTIVE combina-se com AND e só estreita o acesso (ex.: "School staff only"); só as permissivas podem abri-lo.
function escritaEm(tabela: string) {
  return retrato.politicas.filter(
    (p) => p.tabela === tabela && ESCRITA.includes(p.cmd) && p.modo !== "RESTRICTIVE",
  );
}

describe("escrita no modelo de notas", () => {
  it.each(TABELAS_DE_NOTAS)("%s: toda a escrita exige MFA", (tabela) => {
    const semMfa = escritaEm(tabela)
      .filter((p) => !`${p.usando} ${p.verificando}`.includes("is_aal2()"))
      .map((p) => `${p.cmd} "${p.politica}"`);
    expect(
      semMfa,
      `${tabela}: estas políticas deixam escrever notas sem verificação em duas etapas. ` +
        `Se é política nova, junte \`private.is_aal2()\`; se é antiga, largue-a — ` +
        `permissivas combinam-se com OR e a mais fraca decide.`,
    ).toEqual([]);
  });

  it.each(TABELAS_DE_NOTAS)("%s: toda a escrita exige a permissão de notas", (tabela) => {
    const semPermissao = escritaEm(tabela)
      .filter((p) => !`${p.usando} ${p.verificando}`.includes("assessment.grades."))
      .map((p) => `${p.cmd} "${p.politica}"`);
    expect(semPermissao).toEqual([]);
  });

  it("grade_scores amarra o autor declarado ao utilizador real", () => {
    // `enforce_teacher_grade_score_scope` tira o actor de `NEW.updated_by` /
    // `NEW.recorded_by` e devolve NEW quando vem nulo. Sem esta amarra na
    // política, o trigger aceita o actor que lhe derem e a auditoria fica com
    // actor nulo.
    const insert = escritaEm("grade_scores").find((p) => p.cmd === "INSERT");
    const update = escritaEm("grade_scores").find((p) => p.cmd === "UPDATE");
    expect(insert?.verificando).toContain("recorded_by");
    expect(update?.verificando).toContain("updated_by");
  });

  it("nenhuma das três aceita DELETE — uma nota não se apaga", () => {
    for (const tabela of TABELAS_DE_NOTAS) {
      expect(escritaEm(tabela).filter((p) => p.cmd === "DELETE" || p.cmd === "ALL")).toEqual([]);
    }
  });

  it("as políticas de 20260903023500 não voltam", () => {
    const antigas = retrato.politicas
      .filter((p) => TABELAS_DE_NOTAS.includes(p.tabela) && p.politica.startsWith("Academic "))
      .filter((p) => ESCRITA.includes(p.cmd))
      .map((p) => `${p.tabela}.${p.politica}`);
    expect(antigas).toEqual([]);
  });
});
