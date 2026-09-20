import { readFileSync, readdirSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Cada `.select(…)` de `src/` disparado contra a produção, a valer.
 *
 * O teste de colunas (`colunas-inexistentes`) compara o código com o retrato
 * do esquema, e por isso **salta qualquer select com embed** — uma lista com
 * `(` é ambígua de ler sem o grafo de chaves estrangeiras. O Ciclo 97 tentou
 * construir esse grafo a partir do SQL do repositório e descartou-o: é parcial
 * por natureza e deu falsos positivos.
 *
 * Esta é a via que funciona. Não interpreta o select — manda-o ao PostgREST com
 * `limit=0` e vê se é aceite. Um embed com coluna inexistente faz o PostgREST
 * recusar a consulta **inteira**, e quase sempre o chamador lê isso como "não há
 * dados": é assim que uma exportação sai vazia para sempre sem ninguém notar.
 * Foi o que aconteceu a `academic_years(name, code)` no motor de exportação —
 * `code` nunca existiu, e a exportação de matrículas nunca devolveu uma linha.
 *
 * Salta sem credenciais (CI sem segredos, máquina de quem só corre testes
 * unitários), como a sonda de RLS.
 */

const REPO = resolve(__dirname, "../..");

function lerEnv(): Record<string, string> {
  try {
    const txt = readFileSync(resolve(REPO, ".env"), "utf8");
    const out: Record<string, string> = {};
    for (const linha of txt.split("\n")) {
      const t = linha.trim();
      if (!t || t.startsWith("#")) continue;
      const [k, ...v] = t.split("=");
      if (k && v.length) out[k.trim()] = v.join("=").trim();
    }
    return out;
  } catch {
    return {};
  }
}

const env = { ...lerEnv(), ...process.env };
const URL_BASE = env["SUPABASE_URL"] ?? env["VITE_SUPABASE_URL"];
const CHAVE = env["SUPABASE_SERVICE_ROLE_KEY"];
const podeSondar = Boolean(URL_BASE && CHAVE);

/**
 * Tabelas que a produção não tem e cuja ausência já está registada e explicada.
 * Não é para esconder achados: é para o teste falhar por coisas **novas**. Tirar
 * uma entrada daqui quando a migração respectiva for aplicada.
 */
const AUSENCIAS_CONHECIDAS = new Map([
  ["assessment_rule_sets", "migração 20260916140000_assessment_rule_sets.sql, por aplicar"],
  ["tenant_mailboxes", "caixas de correio por tenant — sem migração no repositório"],
]);

function selectsDoCodigo(): { ficheiro: string; tabela: string; colunas: string }[] {
  const ficheiros: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = resolve(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry)) ficheiros.push(full);
    }
  };
  walk(resolve(REPO, "src"));

  const porChave = new Map<string, { ficheiro: string; tabela: string; colunas: string }>();
  for (const f of ficheiros) {
    const código = readFileSync(f, "utf8");
    const padrão =
      /\.from\(\s*"([a-z_][a-z0-9_]*)"\s*\)\s*\n?\s*\.select\(\s*\n?\s*[`"]([^`"]+)[`"]/g;
    for (const m of código.matchAll(padrão)) {
      const colunas = m[2].replace(/\s+/g, "").replace(/,$/, "");
      // `*` não pode falhar por coluna; interpolação não é verificável estaticamente.
      if (!colunas || colunas === "*" || colunas.includes("${")) continue;
      porChave.set(`${m[1]}|${colunas}`, {
        ficheiro: relative(REPO, f),
        tabela: m[1],
        colunas,
      });
    }
  }
  return [...porChave.values()];
}

describe.skipIf(!podeSondar)("selects do código vs. produção (ao vivo)", () => {
  it("o PostgREST aceita todos os selects, embeds incluídos", async () => {
    const alvos = selectsDoCodigo();
    expect(
      alvos.length,
      "nenhum select encontrado — o extractor deixou de funcionar",
    ).toBeGreaterThan(200);

    const recusados: string[] = [];
    for (const { ficheiro, tabela, colunas } of alvos) {
      const resposta = await fetch(
        `${URL_BASE}/rest/v1/${tabela}?select=${encodeURIComponent(colunas)}&limit=0`,
        { headers: { apikey: CHAVE as string, Authorization: `Bearer ${CHAVE}` } },
      );
      if (resposta.ok) continue;
      if (AUSENCIAS_CONHECIDAS.has(tabela)) continue;

      let mensagem = await resposta.text();
      try {
        mensagem = JSON.parse(mensagem).message ?? mensagem;
      } catch {
        /* corpo não-JSON: fica como veio */
      }
      recusados.push(`${ficheiro}: ${tabela}(${colunas.slice(0, 80)}) → ${mensagem.slice(0, 120)}`);
    }

    expect(
      recusados,
      `A produção recusou estes selects. Uma recusa não devolve zero linhas — devolve erro, ` +
        `e quase sempre o chamador trata-o como "não há dados": o ecrã fica vazio para sempre ` +
        `sem ninguém ver um erro.\n${recusados.join("\n")}`,
    ).toEqual([]);
  }, 180_000);

  it("as ausências toleradas continuam a ser só as que estão explicadas", async () => {
    const aindaEmFalta: string[] = [];
    for (const [tabela] of AUSENCIAS_CONHECIDAS) {
      const r = await fetch(`${URL_BASE}/rest/v1/${tabela}?select=*&limit=0`, {
        headers: { apikey: CHAVE as string, Authorization: `Bearer ${CHAVE}` },
      });
      if (!r.ok) aindaEmFalta.push(tabela);
    }
    // A lista encolhe quando uma migração for aplicada — e então tem de sair daqui.
    expect(
      aindaEmFalta,
      `Estas tabelas já existem na produção e devem sair de AUSENCIAS_CONHECIDAS: ` +
        `${[...AUSENCIAS_CONHECIDAS.keys()].filter((t) => !aindaEmFalta.includes(t)).join(", ")}`,
    ).toEqual([...AUSENCIAS_CONHECIDAS.keys()]);
  }, 30_000);
});
