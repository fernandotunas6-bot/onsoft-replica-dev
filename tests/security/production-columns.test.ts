import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * O código só lê e filtra colunas que existem na produção
 * (`supabase/PRODUCTION_SNAPSHOT.json`, regra de docs/agents/DATABASE_RULES.md).
 * Uma coluna inexistente não dá erro de compilação: dá um 400 em produção ou,
 * pior, uma leitura sempre vazia. Coluna nova → migração aplicada e retrato
 * recapturado antes do código que a usa.
 */
type Snapshot = { tabelas: Array<{ tabela: string; colunas: string[] }> };
const snapshot = JSON.parse(readFileSync("supabase/PRODUCTION_SNAPSHOT.json", "utf8")) as Snapshot;
const columns = new Map(snapshot.tabelas.map((t) => [t.tabela, new Set(t.colunas)]));

function walk(dir: string, out: string[] = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".gen.ts")) out.push(path);
  }
  return out;
}

function chainAfter(source: string, index: number) {
  let chain = source.slice(index, index + 1500);
  const end = chain.indexOf(";");
  if (end >= 0) chain = chain.slice(0, end);
  const next = chain.indexOf(".from(");
  return next >= 0 ? chain.slice(0, next) : chain;
}

describe("colunas usadas existem na produção", () => {
  const problems: string[] = [];
  for (const file of walk("src")) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/(?<!storage)\.from\("([a-z_0-9]+)"\)/g)) {
      const table = match[1]!;
      const known = columns.get(table);
      if (!known) continue; // vistas e tabelas fora do retrato
      const chain = chainAfter(source, match.index! + match[0].length);
      const where = `${file}:${source.slice(0, match.index).split("\n").length}`;
      const select = chain.match(/^\s*\.select\(\s*(["'`])([^"'`]*)\1/);
      if (select && !/[(:*${]/.test(select[2]!)) {
        for (const column of select[2]!
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean)) {
          if (!known.has(column)) problems.push(`${where} select ${table}.${column}`);
        }
      }
      for (const filter of chain.matchAll(
        /\.(eq|neq|in|is|order|gt|gte|lt|lte|like|ilike|contains)\(\s*"([a-z_0-9]+)"/g,
      )) {
        if (!known.has(filter[2]!)) problems.push(`${where} ${filter[1]} ${table}.${filter[2]}`);
      }
    }
  }

  it("select e filtros", () => {
    expect(problems).toEqual([]);
  });
});
