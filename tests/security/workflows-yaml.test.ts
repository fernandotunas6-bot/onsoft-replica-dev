import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { load } from "js-yaml";

/**
 * Um ficheiro de workflow que não parseia **não desliga o CI com um erro visível**: o
 * GitHub cria, em cada push, uma verificação falhada com o nome do próprio ficheiro
 * (`.github/workflows/lockfile-sync.yml`), de 0 s e sem passos. Entre dezenas de runs
 * passa por ruído — e o workflow nunca mais corre.
 *
 * Aconteceu a 2026-09-19 a dois ficheiros ao mesmo tempo, pela mesma razão:
 *
 *     if: ${{ !contains(github.event.head_commit.message, 'chore(lock): sync bun lockfile') }}
 *
 * O valor é um **escalar simples**, e o `: ` dentro das aspas simples faz o YAML ver um
 * mapeamento onde devia estar texto — `mapping values are not allowed here`. As aspas
 * simples não protegem nada, porque quem está a ler ainda não sabe que está dentro de uma
 * string. A correcção é pôr o valor inteiro entre aspas duplas.
 *
 * Nada no repositório via isto: o `eslint` não lê YAML e o `check:style` só olha para
 * `src/`. Este teste corre o parser a sério sobre os ficheiros, que é a única forma de
 * apanhar a classe toda em vez deste caso — um `*` à cabeça, um tab na indentação ou umas
 * aspas por fechar partem-nos da mesma maneira e nenhuma expressão regular os cobre.
 */

const REPO = resolve(__dirname, "../..");
const DIR = resolve(REPO, ".github/workflows");

const ficheiros = readdirSync(DIR)
  .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
  .sort();

describe("os ficheiros de workflow do GitHub", () => {
  it("existem — se a pasta ficar vazia, o resto do teste passaria em branco", () => {
    expect(ficheiros.length).toBeGreaterThan(0);
  });

  it.each(ficheiros)("%s parseia como YAML", (nome) => {
    const texto = readFileSync(resolve(DIR, nome), "utf8");
    expect(() => load(texto)).not.toThrow();
  });

  it.each(ficheiros)("%s tem gatilho e pelo menos um job", (nome) => {
    const doc = load(readFileSync(resolve(DIR, nome), "utf8")) as Record<string, unknown>;
    expect(doc, "o ficheiro está vazio ou não é um mapeamento").toBeTypeOf("object");

    // `on` continua a ser a chave literal: o js-yaml 4 em diante deixou de tratar
    // `on`/`off`/`yes`/`no` como booleanos (isso era o YAML 1.1). Se algum dia voltar a
    // ser `true`, esta asserção diz-nos porquê em vez de falhar por "workflow sem gatilho".
    expect(Object.keys(doc), "workflow sem gatilho `on:`").toContain("on");

    const jobs = doc["jobs"] as Record<string, unknown> | undefined;
    expect(jobs, "workflow sem secção `jobs:`").toBeTypeOf("object");
    expect(Object.keys(jobs ?? {}).length).toBeGreaterThan(0);
  });

  it.each(ficheiros)("%s dá a cada job uma máquina e passos", (nome) => {
    const doc = load(readFileSync(resolve(DIR, nome), "utf8")) as Record<string, unknown>;
    const jobs = (doc["jobs"] ?? {}) as Record<string, Record<string, unknown>>;

    for (const [id, job] of Object.entries(jobs)) {
      // Um job ou corre passos numa máquina, ou delega num workflow reutilizável.
      if (typeof job["uses"] === "string") continue;
      expect(job["runs-on"], `${id}: job sem \`runs-on\``).toBeDefined();
      expect(Array.isArray(job["steps"]), `${id}: job sem \`steps\``).toBe(true);
    }
  });
});
