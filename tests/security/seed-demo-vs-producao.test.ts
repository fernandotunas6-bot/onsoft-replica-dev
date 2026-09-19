import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * O seed da escola demo medido contra o retrato da produção.
 *
 * Os testes de `colunas-inexistentes` varrem `src/` à procura de
 * `.from("x").select(…)` e `.from("x").insert({…})` literais. O seed não é
 * apanhado por nenhum dos dois: vive em `scripts/`, que essas varreduras não
 * percorrem, e escreve através do helper `gravar(tabela, payload)`, que esconde
 * a tabela e as colunas de qualquer expressão regular.
 *
 * Foi nessa dupla sombra que apodreceu. Escrevia para `courses` e `term_grades`
 * — que não existem —, para treze colunas inexistentes, e com identificadores
 * que nem UUID eram (`p0000000-…`, `st000000-…`: `p`, `s` e `t` não são dígitos
 * hexadecimais). Enquanto as escritas descartavam o erro, imprimia na mesma
 * "🎉 Sucesso Total! … 100% carregados".
 *
 * Este teste não lê o ficheiro: corre-o, com um cliente-espelho no lugar do
 * Supabase, e confere cada escrita que ele tenta fazer. É por isso imune à
 * indirecção do helper — e continuará a ser se o seed mudar de forma.
 */

type Escrita = { tabela: string; linhas: Record<string, unknown>[] };

const escritas: Escrita[] = [];

vi.mock("@supabase/supabase-js", () => {
  const registar = (tabela: string, payload: unknown) => {
    const linhas = (Array.isArray(payload) ? payload : [payload]) as Record<string, unknown>[];
    escritas.push({ tabela, linhas });
    return { data: null, error: null };
  };

  const consulta = (tabela: string) => {
    const q: Record<string, unknown> = {};
    const devolveQ = () => q;
    Object.assign(q, {
      select: devolveQ,
      eq: devolveQ,
      in: devolveQ,
      order: devolveQ,
      limit: devolveQ,
      delete: devolveQ,
      // O seed procura um plano SaaS antes de ligar o tenant; sem ele desiste
      // dessa parte e metade das escritas nunca chegaria a ser medida.
      maybeSingle: async () =>
        tabela === "plans"
          ? {
              data: {
                id: "00000000-0000-4000-8000-000000000001",
                max_students: 10000,
                max_storage_gb: 200,
              },
              error: null,
            }
          : { data: null, error: null },
      single: async () => ({ data: null, error: null, count: 0 }),
      then: (resolver: (v: unknown) => unknown) => resolver({ data: null, error: null, count: 0 }),
      insert: (p: unknown) => registar(tabela, p),
      upsert: (p: unknown) => registar(tabela, p),
      update: (p: unknown) => {
        registar(tabela, p);
        return q;
      },
    });
    return q;
  };

  return { createClient: () => ({ from: (t: string) => consulta(t), auth: {} }) };
});

const REPO = resolve(__dirname, "../..");
const snapshot = JSON.parse(
  readFileSync(resolve(REPO, "supabase/PRODUCTION_SNAPSHOT.json"), "utf8"),
) as { tabelas: { tabela: string; colunas?: string[] }[] };

const colunasPorTabela = new Map<string, Set<string>>();
for (const t of snapshot.tabelas) {
  if (t.colunas?.length) colunasPorTabela.set(t.tabela, new Set(t.colunas));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `national_id` é o NIF angolano e acaba em `_id` sem ser identificador. */
const NAO_SAO_UUID = new Set(["national_id"]);

beforeAll(async () => {
  process.env["SUPABASE_URL"] = "http://espelho.invalido";
  process.env["SUPABASE_SERVICE_ROLE_KEY"] = "espelho";
  process.env["SEED_ACTOR_USER_ID"] = "00000000-0000-4000-8000-0000000000aa";
  const seed = await import("../../scripts/siga/seed-to-supabase.mjs");
  await seed.runSeed();
}, 60_000);

describe("seed da escola demo vs. produção", () => {
  it("escreve mesmo alguma coisa (senão o resto do ficheiro não prova nada)", () => {
    expect(escritas.length).toBeGreaterThan(10);
  });

  it("nenhuma escrita aponta para uma tabela que não existe em produção", () => {
    const inexistentes = [
      ...new Set(escritas.map((e) => e.tabela).filter((t) => !colunasPorTabela.has(t))),
    ];
    expect(
      inexistentes,
      `O seed escreve para tabelas que a produção não tem: ${inexistentes.join(", ")}. ` +
        `O PostgREST recusa a escrita inteira — e um seed que engole esse erro deixa uma ` +
        `escola demo meia vazia com ar de completa.`,
    ).toEqual([]);
  });

  it("nenhuma escrita grava uma coluna que a tabela não tem", () => {
    const maus: string[] = [];
    for (const { tabela, linhas } of escritas) {
      const reais = colunasPorTabela.get(tabela);
      if (!reais) continue; // já acusado pelo teste anterior
      for (const coluna of new Set(linhas.flatMap((l) => Object.keys(l)))) {
        if (!reais.has(coluna)) maus.push(`${tabela}.${coluna}`);
      }
    }
    expect(
      [...new Set(maus)],
      `Estas colunas não existem: ${[...new Set(maus)].join(", ")}. ` +
        `Uma escrita recusada deixa quem a leu convencido de que gravou.`,
    ).toEqual([]);
  });

  it("todos os identificadores são UUID válidos", () => {
    const maus = new Set<string>();
    for (const { tabela, linhas } of escritas) {
      for (const linha of linhas) {
        for (const [chave, valor] of Object.entries(linha)) {
          if (!/(^id$|_id$)/.test(chave) || NAO_SAO_UUID.has(chave)) continue;
          if (typeof valor !== "string" || UUID.test(valor)) continue;
          maus.add(`${tabela}.${chave}=${valor}`);
        }
      }
    }
    expect(
      [...maus].slice(0, 8),
      `Identificadores que não são UUID (${maus.size} no total). O Postgres recusa-os com ` +
        `22P02 na primeira linha — nenhum prefixo fora de [0-9a-f] serve, por muito legível ` +
        `que seja.`,
    ).toEqual([]);
  });

  it("as escritas saem por uma ordem que as chaves estrangeiras aceitam", () => {
    const ordem = escritas.map((e) => e.tabela);
    const primeira = (t: string) => ordem.indexOf(t);
    // Cada par é uma dependência real declarada em produção.
    const dependencias: [string, string][] = [
      ["academic_levels", "programs"],
      ["programs", "grade_levels"],
      ["grade_levels", "class_groups"],
      ["campuses", "class_groups"],
      ["campuses", "rooms"],
      ["people", "students"],
      ["students", "enrollments"],
      ["class_groups", "siga_assessment_items"],
      ["subjects", "siga_assessment_items"],
      ["enrollments", "finance_contracts"],
      ["fee_plans", "fee_items"],
      ["finance_contracts", "finance_invoices"],
      ["siga_assessment_items", "siga_assessment_scores"],
      ["enrollments", "siga_assessment_scores"],
    ];
    const invertidas = dependencias
      .filter(([antes, depois]) => primeira(antes) >= 0 && primeira(depois) >= 0)
      .filter(([antes, depois]) => primeira(antes) > primeira(depois))
      .map(([antes, depois]) => `${depois} antes de ${antes}`);
    expect(
      invertidas,
      `Estas escritas saem antes daquilo de que dependem: ${invertidas.join("; ")}.`,
    ).toEqual([]);
  });
});
