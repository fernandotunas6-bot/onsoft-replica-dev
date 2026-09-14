import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve, relative } from "node:path";

/**
 * Nomes de coluna que o código pede e a base não tem.
 *
 * O caminho privilegiado (`loadSgaAdminClient`) não tem tipos — passa por
 * `sgaClient()`, que relaxa para `any` — por isso um nome de coluna errado não
 * é apanhado por nada. O PostgREST recusa o `select` inteiro, e o chamador
 * costuma tratar o erro como «não há dados».
 *
 * Aconteceu duas vezes, ambas encontradas a 2026-09-14:
 *
 *   · `dashboard/server.ts` pedia `people.birth_date` (é `date_of_birth`) num
 *     bloco com `catch` vazio — o cartão «aniversários hoje» mostrava zero
 *     desde sempre
 *   · `alumni/server.ts` pedia a mesma coluna e o perfil Alumni ficava sem
 *     dados pessoais nenhuns
 *
 * Este teste lê os `select("…")` do código e compara as colunas com o retrato
 * da produção. Não cobre tudo — `select("*")`, embeds e colunas em `.eq()`
 * ficam de fora — mas cobre a forma exacta que já falhou duas vezes.
 */

const REPO = resolve(__dirname, "../..");

type Retrato = { tabelas: { tabela: string; colunas?: string[] }[] };

const retrato = JSON.parse(
  readFileSync(resolve(REPO, "supabase/PRODUCTION_SNAPSHOT.json"), "utf8"),
) as Retrato;

/** Colunas por tabela, quando o retrato as traz. */
const colunasPorTabela = new Map<string, Set<string>>();
for (const t of retrato.tabelas) {
  if (t.colunas?.length) colunasPorTabela.set(t.tabela, new Set(t.colunas));
}

/** `.from("x").select("a, b, c")` — só a forma directa, sem embeds. */
function leiturasDoCodigo(): { ficheiro: string; tabela: string; colunas: string[] }[] {
  const achados: { ficheiro: string; tabela: string; colunas: string[] }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = resolve(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry)) continue;
      const código = readFileSync(full, "utf8");
      const padrão = /\.from\(\s*["'`]([a-z_]+)["'`]\s*\)\s*\n?\s*\.select\(\s*"([^"]+)"/g;
      for (const m of código.matchAll(padrão)) {
        const [, tabela, lista] = m;
        if (lista.includes("(") || lista.includes("*")) continue; // embeds e select(*)
        achados.push({
          ficheiro: relative(REPO, full),
          tabela,
          colunas: lista.split(",").map((c) => c.trim().split(":")[0].trim()),
        });
      }
    }
  };
  walk(resolve(REPO, "src"));
  return achados;
}

const leituras = leiturasDoCodigo();

describe("colunas pedidas vs colunas que existem", () => {
  it("o retrato traz colunas para comparar", () => {
    expect(
      colunasPorTabela.size,
      "o retrato não tem colunas por tabela — corra npm run siga:db-snapshot",
    ).toBeGreaterThan(50);
  });

  it("encontra leituras suficientes para a verificação valer", () => {
    expect(leituras.length).toBeGreaterThan(50);
  });

  it("nenhum select pede coluna que a tabela não tem", () => {
    const erradas: string[] = [];
    for (const leitura of leituras) {
      const colunas = colunasPorTabela.get(leitura.tabela);
      if (!colunas) continue; // tabela fora do retrato: outro teste trata disso
      for (const coluna of leitura.colunas) {
        if (!colunas.has(coluna)) {
          erradas.push(`${leitura.ficheiro}: ${leitura.tabela}.${coluna}`);
        }
      }
    }
    expect(
      erradas,
      `Estes selects pedem colunas que não existem: ${erradas.join("; ")}. ` +
        `O PostgREST recusa o select inteiro, e quase sempre o erro é tratado ` +
        `como "não há dados" — é assim que um cartão fica a zero para sempre.`,
    ).toEqual([]);
  });
});
