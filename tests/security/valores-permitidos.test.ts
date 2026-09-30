import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";

/**
 * Valores literais que o código grava ou procura e a base não aceita.
 *
 * `valores` no retrato são as listas de um CHECK `coluna = ANY (ARRAY[...])`. Um valor
 * fora da lista numa escrita é recusado; num `.eq()` nunca encontra nada. Encontrado a
 * 2026-09-29:
 *
 *   · anular matrícula gravava "withdrawn" e depois "inactive" — nenhuma era anulada
 *     (é "cancelled")
 *   · desactivar turma e remover horário gravavam "inactive" (é "archived")
 *   · o estorno PayFlow reabria a fatura como "issued" (é "open"/"partially_paid")
 *   · o login procurava domínios com status "verified" (é "active") — o domínio
 *     próprio da escola nunca era reconhecido nos e-mails de acesso
 *
 * Só apanha `chave: "literal"` no topo de insert/update/upsert e `.eq("coluna",
 * "literal")`. `.neq()` e `.in()` com um valor impossível não fazem mal e ficam de fora.
 */

const REPO = resolve(__dirname, "../..");

type Retrato = { valores?: { tabela: string; coluna: string; valores: string[] }[] };
const retrato = JSON.parse(
  readFileSync(resolve(REPO, "supabase/PRODUCTION_SNAPSHOT.json"), "utf8"),
) as Retrato;

const permitidos = new Map<string, Set<string>>(
  (retrato.valores ?? []).map((v) => [`${v.tabela}.${v.coluna}`, new Set(v.valores)]),
);

function semComentarios(código: string) {
  return código.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
}

/** `chave: "valor"` no nível de topo de um objecto literal (sem as chavetas). */
function literaisDeTopo(corpo: string): [string, string][] {
  const pares: [string, string][] = [];
  let nível = 0;
  let aspas: string | null = null;
  let segmento = "";
  const fechar = () => {
    const m = segmento.match(/^\s*([a-z_][a-z0-9_]*)\s*:\s*"([^"]*)"\s*$/i);
    if (m) pares.push([m[1]!, m[2]!]);
    segmento = "";
  };
  for (let i = 0; i < corpo.length; i++) {
    const ch = corpo[i]!;
    if (aspas) {
      if (ch === "\\") i++;
      else if (ch === aspas) aspas = null;
      if (nível === 0) segmento += ch;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") aspas = ch;
    else if ("{[(".includes(ch)) nível++;
    else if ("}])".includes(ch)) nível--;
    else if (ch === "," && nível === 0) {
      fechar();
      continue;
    }
    if (nível === 0) segmento += ch;
  }
  fechar();
  return pares;
}

type Uso = { ficheiro: string; linha: number; tipo: string; chave: string; valor: string };

function usosDoCodigo(): Uso[] {
  const usos: Uso[] = [];
  const FROM = /\.from\(\s*["'`]([a-z_]+)["'`]\s*\)/g;
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = resolve(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry)) continue;
      const código = semComentarios(readFileSync(full, "utf8"));
      for (const m of código.matchAll(FROM)) {
        const tabela = m[1]!;
        const início = (m.index ?? 0) + m[0].length;
        const próximo = código.indexOf(".from(", início);
        const cadeia = código.slice(início, próximo === -1 ? undefined : próximo).slice(0, 2000);
        const base = {
          ficheiro: relative(REPO, full),
          linha: código.slice(0, m.index).split("\n").length,
        };

        for (const f of cadeia.matchAll(/\.eq\(\s*"([a-z_]+)"\s*,\s*"([^"]*)"/g)) {
          usos.push({ ...base, tipo: "filtro", chave: `${tabela}.${f[1]}`, valor: f[2]! });
        }

        const escrita = cadeia.match(/^\s*\.(insert|update|upsert)\(\s*\{/);
        if (escrita) {
          const abre = escrita[0].length - 1;
          let profundidade = 0;
          let fim = abre;
          for (; fim < cadeia.length; fim++) {
            if (cadeia[fim] === "{") profundidade++;
            else if (cadeia[fim] === "}" && --profundidade === 0) break;
          }
          for (const [coluna, valor] of literaisDeTopo(cadeia.slice(abre + 1, fim))) {
            usos.push({ ...base, tipo: escrita[1]!, chave: `${tabela}.${coluna}`, valor });
          }
        }
      }
    }
  };
  walk(resolve(REPO, "src"));
  return usos;
}

describe("valores gravados e filtrados vs CHECK da produção", () => {
  it("o retrato traz os valores permitidos", () => {
    expect(
      permitidos.size,
      "o retrato não tem `valores` — corra npm run siga:db-snapshot",
    ).toBeGreaterThan(100);
  });

  const usos = usosDoCodigo().filter((u) => permitidos.has(u.chave));

  it("encontra usos suficientes para a verificação valer", () => {
    expect(usos.length).toBeGreaterThan(100);
  });

  it("nenhum valor literal fica fora do que a base aceita", () => {
    const errados = usos
      .filter((u) => !permitidos.get(u.chave)!.has(u.valor))
      .map((u) => `${u.ficheiro}:${u.linha}: ${u.tipo} ${u.chave} = "${u.valor}"`);
    expect(
      errados,
      `Valores que a base não aceita: ${errados.join("; ")}. Numa escrita a base recusa a ` +
        `linha; num filtro a consulta nunca encontra nada.`,
    ).toEqual([]);
  });

  it("lê pares literais de topo e ignora os aninhados", () => {
    expect(literaisDeTopo(` status: "cancelled", meta: { status: "x" }, n: 1 `)).toEqual([
      ["status", "cancelled"],
    ]);
  });
});
