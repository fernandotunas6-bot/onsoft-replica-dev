/**
 * Embeds do PostgREST sem chave estrangeira que os ligue.
 *
 * `from("a").select("x, b(y)")` só funciona se houver uma chave estrangeira
 * entre `a` e `b`, num sentido ou no outro. Sem ela o PostgREST responde 400 e o
 * select inteiro falha. Os tipos não o apanham: o caminho privilegiado não é
 * tipado e o teste das colunas só olha para as colunas de topo.
 *
 * Foi assim que a exportação de notas falhou em produção (registos de
 * 2026-09-27): `grade_scores` embebia `gradebooks!inner(...)`, mas a nota
 * liga-se ao diário pelo item de avaliação (`grade_scores → grade_items →
 * gradebooks`). Toda a exportação de notas dava erro.
 *
 * As relações vêm de `relacoes` no retrato (`npm run siga:db-snapshot`).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = resolve(__dirname, "../..");
const retrato = JSON.parse(
  readFileSync(resolve(REPO, "supabase/PRODUCTION_SNAPSHOT.json"), "utf8"),
) as {
  tabelas: { tabela: string }[];
  relacoes?: { de: string; para: string; chave: string }[];
};

const tabelas = new Set(retrato.tabelas.map((t) => t.tabela));
const relacoes = retrato.relacoes ?? [];
const ligadas = new Set(relacoes.flatMap((r) => [`${r.de}>${r.para}`, `${r.para}>${r.de}`]));
const chaves = new Map(relacoes.map((r) => [r.chave, r]));

type Embed = { nome: string; dica: string | null; filhos: Embed[] };

/** Lê a lista do select e devolve os embeds, com os aninhados dentro de cada um. */
function embedsDe(lista: string): Embed[] {
  const texto = lista.replace(/\s+/g, "");
  let i = 0;
  const ler = (): Embed[] => {
    const encontrados: Embed[] = [];
    let campo = "";
    while (i < texto.length) {
      const c = texto[i++];
      if (c === "(") {
        const alvo = campo.split(":").pop() ?? "";
        const [nome, dica = null] = alvo.split("!");
        const filhos = ler();
        encontrados.push({ nome, dica, filhos });
        campo = "";
      } else if (c === ")") {
        return encontrados;
      } else if (c === ",") {
        campo = "";
      } else {
        campo += c;
      }
    }
    return encontrados;
  };
  return ler();
}

function selectsComEmbed(): { ficheiro: string; tabela: string; lista: string }[] {
  const achados: { ficheiro: string; tabela: string; lista: string }[] = [];
  const padrão =
    /\.from\(\s*["'`]([a-z_]+)["'`]\s*\)\s*\n?\s*\.select\(\s*(?:\n\s*)?["'`]([\s\S]*?)["'`]\s*[,)]/g;
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = resolve(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry)) continue;
      const código = readFileSync(full, "utf8");
      for (const m of código.matchAll(padrão)) {
        if (m[2].includes("(")) {
          achados.push({ ficheiro: relative(REPO, full), tabela: m[1], lista: m[2] });
        }
      }
    }
  };
  walk(resolve(REPO, "src"));
  return achados;
}

/** Embeds cuja tabela existe mas não tem chave estrangeira com a tabela-mãe. */
function semRelacao(tabela: string, embeds: Embed[], ficheiro: string): string[] {
  const erros: string[] = [];
  for (const e of embeds) {
    // Sem tabela conhecida (vista, coluna usada como nome, tabela em falta):
    // outros testes tratam disso.
    if (!tabelas.has(e.nome)) continue;
    const dica = e.dica && e.dica !== "inner" && e.dica !== "left" ? e.dica : null;
    if (dica && chaves.has(dica)) {
      const r = chaves.get(dica)!;
      const certa =
        (r.de === tabela && r.para === e.nome) || (r.de === e.nome && r.para === tabela);
      if (!certa) erros.push(`${ficheiro}: ${tabela} → ${e.nome}!${dica} (chave de outro par)`);
    } else if (!dica && tabelas.has(tabela) && !ligadas.has(`${tabela}>${e.nome}`)) {
      erros.push(`${ficheiro}: ${tabela} → ${e.nome}`);
    }
    erros.push(...semRelacao(e.nome, e.filhos, ficheiro));
  }
  return erros;
}

describe("embeds do PostgREST", () => {
  const selects = selectsComEmbed();

  it("o retrato traz as chaves estrangeiras", () => {
    expect(
      relacoes.length,
      "o retrato não tem `relacoes` — corra npm run siga:db-snapshot",
    ).toBeGreaterThan(100);
  });

  it("encontra selects com embed suficientes para a verificação valer", () => {
    expect(selects.length).toBeGreaterThan(30);
  });

  it("lê embeds aninhados com a tabela-mãe certa", () => {
    const e = embedsDe("id, grade_items!inner(code, gradebooks!inner(term_id)), x:people(y)");
    expect(e.map((x) => x.nome)).toEqual(["grade_items", "people"]);
    expect(e[0].filhos.map((x) => x.nome)).toEqual(["gradebooks"]);
    expect(semRelacao("grade_scores", embedsDe("id, gradebooks!inner(term_id)"), "t")).toEqual([
      "t: grade_scores → gradebooks",
    ]);
  });

  it("nenhum embed pede uma tabela sem chave estrangeira que a ligue", () => {
    const erros = selects.flatMap((s) => semRelacao(s.tabela, embedsDe(s.lista), s.ficheiro));
    expect(
      [...new Set(erros)],
      `Embeds sem relação: ${[...new Set(erros)].join("; ")}. O PostgREST responde 400 ` +
        `e o select inteiro falha — liguem pela tabela intermédia que tem a chave.`,
    ).toEqual([]);
  });
});
