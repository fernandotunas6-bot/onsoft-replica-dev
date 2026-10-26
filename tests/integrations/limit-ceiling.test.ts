import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { blankCommentsAndStrings } from "../security/server-fn-scan";

/**
 * Portão do tecto de leitura.
 *
 * O PostgREST devolve no máximo 1000 linhas por pedido e corta sem erro: um
 * `.limit(5000)` recebe 1000. O número escrito promete o que não se lê, e foi
 * assim que a organização de turmas, as candidaturas do Superior e o horário da
 * escola calculavam sobre parte dos dados (26/10). Para ler tudo:
 * `pagedReadClient`, `readAllPages` ou `readInChunks`.
 */
const SERVER_ROW_CEILING = 1000;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts") ? [path] : [];
  });
}

describe("tecto de leitura do PostgREST", () => {
  it("nenhum `.limit(N)` acima de 1000: o servidor devolve 1000 e não avisa", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles("src")) {
      const code = blankCommentsAndStrings(readFileSync(file, "utf8"));
      for (const match of code.matchAll(/\.limit\(\s*([\d_]+)\s*\)/g)) {
        const value = Number(match[1]!.replace(/_/g, ""));
        if (value > SERVER_ROW_CEILING) {
          const line = code.slice(0, match.index).split("\n").length;
          offenders.push(`${file}:${line} .limit(${match[1]})`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("o portão apanha o caso que existia", () => {
    const code = blankCommentsAndStrings(
      'db.from("enrollments").select("id").limit(5000); // .limit(9000) em comentário não conta',
    );
    expect([...code.matchAll(/\.limit\(\s*([\d_]+)\s*\)/g)].map((m) => m[1])).toEqual(["5000"]);
  });
});
