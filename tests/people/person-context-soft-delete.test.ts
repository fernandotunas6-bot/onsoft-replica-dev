import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Guarda dos filtros de vínculo vivo em `resolvePersonContext`.
 *
 * Três fontes do contexto de uma pessoa têm eliminação lógica ou validade, e
 * nenhuma era filtrada: um registo de aluno eliminado mantinha o papel «aluno»
 * e continuava a produzir resumo financeiro; um vínculo declarado em
 * `person_roles` apagado continuava a declarar o papel; e um encarregado cuja
 * ligação expirou continuava a constar como encarregado corrente.
 *
 * Teste estático sobre a fonte: as consultas atravessam o cliente de
 * administração do Supabase, que não há como exercitar aqui sem base real. O
 * que se fixa é a presença dos filtros — reintroduzir o defeito falha a
 * revisão. A derivação que consome estes factos é testada em
 * `enrollment-state.test.ts`.
 */

const source = readFileSync(
  resolve(import.meta.dirname, "../../src/features/people/person-context.ts"),
  "utf-8",
);

function queryBlock(table: string): string {
  const marker = `.from("${table}")`;
  const start = source.indexOf(marker);
  expect(start, `consulta a ${table} não encontrada`).toBeGreaterThan(-1);
  return source.slice(start, start + 700);
}

describe("resolvePersonContext — vínculos vivos", () => {
  it("exclui registos de aluno eliminados", () => {
    expect(queryBlock("students")).toContain('.is("deleted_at", null)');
  });

  it("não rebenta quando existe mais de um registo de aluno vivo", () => {
    // maybeSingle() lança com várias linhas; o limit(1) antes dele é o que
    // impede a página da pessoa de falhar inteira por um duplicado de dados.
    const block = queryBlock("students");
    expect(block).toContain(".limit(1)");
    expect(block.indexOf(".limit(1)")).toBeLessThan(block.indexOf(".maybeSingle()"));
  });

  it("exclui vínculos institucionais declarados e depois eliminados", () => {
    expect(queryBlock("person_roles")).toContain('.is("deleted_at", null)');
  });

  it("exclui vínculos de encarregado com validade expirada", () => {
    const block = queryBlock("student_guardians");
    expect(block).toContain("valid_until.is.null");
    expect(block).toContain("valid_until.gte.");
  });

  it("resolve e devolve a camada canónica da pessoa", () => {
    expect(source).toContain("derivePersonEnrollmentStatus");
    expect(source).toContain("enrollment_status");
  });
});
