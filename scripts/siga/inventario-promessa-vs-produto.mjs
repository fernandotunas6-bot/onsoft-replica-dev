#!/usr/bin/env node
/**
 * Promessa vs produto — `npm run siga:inventario`
 *
 * A auditoria das áreas 5 a 9 encontrou o mesmo padrão quatro vezes: uma tabela bem
 * desenhada em produção, povoada ou não, que **nenhuma linha de código lê**. O ciclo de
 * vida das pautas, a emissão de documentos, o catálogo de módulos, as preferências de
 * comunicação. Em cada caso alguém leu o esquema, concluiu que a funcionalidade existia,
 * e estava enganado.
 *
 * Um documento a dizê-lo envelhece na semana seguinte. Este script volta a perguntar.
 *
 * Para cada tabela de produção cruza três factos:
 *
 *   1. **existe** — está no retrato (`PRODUCTION_SNAPSHOT.json`);
 *   2. **tem dados** — contagem de linhas, perguntada à base;
 *   3. **é usada** — `src/` refere-a em `.from("…")`, ou uma função da base com esse
 *      nome no corpo é chamada por `.rpc("…")`.
 *
 * E classifica:
 *
 *   · `viva`        — código e dados. O caso normal.
 *   · `sem dados`   — há código, não há linhas. Funcionalidade por estrear.
 *   · `SEM LEITOR`  — há linhas, não há código. **Dados que ninguém lê**: ou a
 *                     funcionalidade foi substituída e a tabela ficou, ou foi escrita por
 *                     fora (importador, SQL à mão) e a aplicação não sabe dela.
 *   · `ORFA`        — nem uma coisa nem outra.
 *
 * As duas últimas são as que interessam. Nenhuma é, por si, um defeito — mas cada uma é
 * uma promessa por confirmar, e é isso que este script serve para não deixar esquecer.
 *
 * **Limite conhecido, e é preciso tê-lo em conta ao ler:** a detecção de uso é textual.
 * Uma tabela alcançada só por vista, por trigger ou pelo corpo de uma função da base
 * aparece como sem leitor sem o ser. Por isso o relatório distingue "sem referência em
 * `src/`" de "sem uso" — a primeira é o que o script mede, a segunda é a conclusão que
 * exige olhar. Os triggers e as funções que tocam cada tabela são listados ao lado,
 * precisamente para essa leitura.
 *
 * Só lê — do Postgres e do código. Não altera nada.
 *
 * Requer o CLI do Supabase ligado ao projecto (`supabase link`).
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const RETRATO = resolve(raiz, "supabase/PRODUCTION_SNAPSHOT.json");
const SAIDA = resolve(raiz, "docs/auditoria/inventario-promessa-vs-produto.md");

function consultar(sql) {
  const bruto = execFileSync("npx", ["supabase", "db", "query", sql, "--linked"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(bruto.slice(bruto.indexOf("{"))).rows ?? [];
}

function ficheirosFonte(dir, acc = []) {
  for (const entrada of readdirSync(dir)) {
    const caminho = resolve(dir, entrada);
    if (statSync(caminho).isDirectory()) ficheirosFonte(caminho, acc);
    else if (/\.(ts|tsx)$/.test(entrada) && !/\.test\.tsx?$/.test(entrada)) acc.push(caminho);
  }
  return acc;
}

const retrato = JSON.parse(readFileSync(RETRATO, "utf8"));
const tabelas = retrato.tabelas.map((t) => t.tabela).sort();

// ── 1. Contagem de linhas, numa só ida à base ────────────────────────────────────────
const contagens = new Map();
{
  const uniao = tabelas
    .map((t) => `select '${t}'::text as tabela, count(*)::bigint as linhas from public.${t}`)
    .join(" union all ");
  for (const linha of consultar(uniao)) {
    contagens.set(linha.tabela, Number(linha.linhas));
  }
}

// ── 2. Referências no código ──────────────────────────────────────────────────────────
const fontes = ficheirosFonte(resolve(raiz, "src")).map((caminho) => ({
  caminho: relative(raiz, caminho),
  texto: readFileSync(caminho, "utf8"),
}));

// Tipos gerados não contam como uso: descrevem o esquema, não lhe tocam.
const relevantes = fontes.filter((f) => !f.caminho.endsWith("integrations/supabase/types.ts"));

const usos = new Map();
for (const tabela of tabelas) {
  const alvo = `from("${tabela}")`;
  const ficheiros = relevantes.filter((f) => f.texto.includes(alvo)).map((f) => f.caminho);
  const escreve = relevantes.some((f) => {
    for (const trecho of f.texto.split(alvo).slice(1)) {
      const cadeia = trecho.slice(0, Math.max(0, trecho.indexOf(".from(") + 1) || 500);
      if (/\.(insert|update|upsert|delete)\(/.test(cadeia)) return true;
    }
    return false;
  });
  usos.set(tabela, { ficheiros, escreve });
}

// ── 3. Triggers e funções da base que tocam cada tabela ───────────────────────────────
const triggersPorTabela = new Map();
for (const g of retrato.triggers) {
  if (!triggersPorTabela.has(g.tabela)) triggersPorTabela.set(g.tabela, []);
  triggersPorTabela.get(g.tabela).push(g.trigger);
}

// Funções da base cujo corpo refere a tabela **e** que a aplicação chama por `.rpc()`.
const rpcsChamadas = new Set();
for (const f of relevantes) {
  for (const m of f.texto.matchAll(/\.rpc\(\s*["'`]([a-z0-9_]+)["'`]/gi)) rpcsChamadas.add(m[1]);
}
const tabelasPorRpcChamada = new Map();
if (rpcsChamadas.size) {
  const lista = [...rpcsChamadas].map((n) => `'${n}'`).join(",");
  const linhas = consultar(`
    select p.proname as funcao, pg_get_functiondef(p.oid) as corpo
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public','private') and p.proname in (${lista})`);
  for (const { funcao, corpo } of linhas) {
    for (const tabela of tabelas) {
      if (new RegExp(`\\b${tabela}\\b`).test(corpo)) {
        if (!tabelasPorRpcChamada.has(tabela)) tabelasPorRpcChamada.set(tabela, new Set());
        tabelasPorRpcChamada.get(tabela).add(funcao);
      }
    }
  }
}

// ── 4. Classificação ──────────────────────────────────────────────────────────────────
function classificar(tabela) {
  const { ficheiros } = usos.get(tabela);
  const porRpc = tabelasPorRpcChamada.get(tabela);
  const temCodigo = ficheiros.length > 0 || (porRpc && porRpc.size > 0);
  const temDados = (contagens.get(tabela) ?? 0) > 0;
  if (temCodigo && temDados) return "viva";
  if (temCodigo) return "sem dados";
  if (temDados) return "SEM LEITOR";
  return "ORFA";
}

const resultado = tabelas.map((tabela) => {
  const { ficheiros, escreve } = usos.get(tabela);
  const porRpc = [...(tabelasPorRpcChamada.get(tabela) ?? [])].sort();
  return {
    tabela,
    estado: classificar(tabela),
    linhas: contagens.get(tabela) ?? 0,
    ficheiros: ficheiros.length,
    escreve,
    porRpc,
    triggers: (triggersPorTabela.get(tabela) ?? []).length,
  };
});

// ── 5. Relatório ──────────────────────────────────────────────────────────────────────
const porEstado = (e) => resultado.filter((r) => r.estado === e);
const hoje = new Date().toISOString().slice(0, 10);

const linhas = [];
linhas.push("# Inventário — promessa vs produto");
linhas.push("");
linhas.push(`**Gerado em ${hoje} por \`npm run siga:inventario\`. Não editar à mão.**`);
linhas.push("");
linhas.push(
  "Cruza o que existe na base com o que o código refere. Ver o cabeçalho de " +
    "`scripts/siga/inventario-promessa-vs-produto.mjs` para o método e para o limite " +
    "da detecção — que é textual, e por isso a coluna certa a ler é *referências*, não *uso*.",
);
linhas.push("");
linhas.push("| Estado | Tabelas | O que significa |");
linhas.push("|---|---:|---|");
linhas.push(`| viva | ${porEstado("viva").length} | código e dados |`);
linhas.push(
  `| sem dados | ${porEstado("sem dados").length} | há código, não há linhas — por estrear |`,
);
linhas.push(
  `| **SEM LEITOR** | ${porEstado("SEM LEITOR").length} | **há linhas e nenhuma referência em \`src/\`** |`,
);
linhas.push(`| ORFA | ${porEstado("ORFA").length} | nem código nem dados |`);
linhas.push("");

for (const estado of ["SEM LEITOR", "ORFA", "sem dados", "viva"]) {
  const grupo = porEstado(estado);
  if (!grupo.length) continue;
  linhas.push(`## ${estado} (${grupo.length})`);
  linhas.push("");
  linhas.push("| Tabela | Linhas | Ficheiros | Escreve | Por RPC | Triggers |");
  linhas.push("|---|---:|---:|:-:|---|---:|");
  for (const r of grupo.sort((a, b) => b.linhas - a.linhas || a.tabela.localeCompare(b.tabela))) {
    linhas.push(
      `| \`${r.tabela}\` | ${r.linhas} | ${r.ficheiros} | ${r.escreve ? "sim" : "—"} | ${
        r.porRpc.length ? r.porRpc.map((f) => `\`${f}\``).join(", ") : "—"
      } | ${r.triggers} |`,
    );
  }
  linhas.push("");
}

writeFileSync(SAIDA, linhas.join("\n"), "utf8");
console.log(`Escrito: ${relative(raiz, SAIDA)}`);
for (const estado of ["viva", "sem dados", "SEM LEITOR", "ORFA"]) {
  console.log(`  ${estado.padEnd(12)} ${porEstado(estado).length}`);
}
