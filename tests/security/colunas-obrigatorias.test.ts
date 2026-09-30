import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";

/**
 * Colunas que um insert TEM de enviar e o código omitia.
 *
 * `obrigatorias` no retrato são as colunas NOT NULL sem valor por omissão (nem
 * identidade, nem geradas). O Postgres verifica-as antes do `ON CONFLICT`, por isso
 * um `upsert` sem elas falha mesmo quando a linha já existe — e o caminho
 * privilegiado não tem tipos que o apanhem.
 *
 * Encontrado a 2026-09-29, tudo recusado pela base em todas as chamadas:
 *
 *   · `profiles.display_name` em `inviteSystemUser` — criar ou convidar contas em
 *     Acessos falhava sempre, e a conta acabada de criar era apagada na reversão
 *   · `saas_audit_logs.entity` na auditoria da mudança de telefone e da reposição
 *     de senha por código — os registos perdiam-se em silêncio
 *   · `enrollments.enrollment_number`, `enrollment_applications.form_id` e
 *     `student_guardians.created_by` nos importadores
 *
 * Só lê objectos literais em `.from("x").insert({…})`/`.upsert({…})`; um objecto
 * com `...spread` ou numa variável fica de fora, porque não se sabe o que traz.
 */

const REPO = resolve(__dirname, "../..");

type Retrato = { tabelas: { tabela: string; obrigatorias?: string[] }[] };
const retrato = JSON.parse(
  readFileSync(resolve(REPO, "supabase/PRODUCTION_SNAPSHOT.json"), "utf8"),
) as Retrato;

const obrigatoriasPorTabela = new Map(
  retrato.tabelas.map((t) => [t.tabela, new Set(t.obrigatorias ?? [])] as const),
);

/**
 * Colunas preenchidas por um trigger BEFORE INSERT na produção — omiti-las é
 * correcto. Cada entrada leva o trigger que a preenche.
 */
const PREENCHIDAS_POR_TRIGGER = new Set<string>([]);

/** Sem comentários: uma vírgula num comentário não pode partir a lista de chaves. */
function semComentarios(código: string) {
  return código.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
}

/** Chaves de topo de um objecto literal (sem as chavetas); `...` marca um spread. */
function chavesDeTopo(corpo: string): string[] {
  const chaves: string[] = [];
  let nível = 0;
  let aspas: string | null = null;
  let segmento = "";
  const fechar = () => {
    const m = segmento.match(/^\s*(\.\.\.)?\s*([a-z_][a-z0-9_]*)\s*(?::|,|$)/i);
    if (m) chaves.push(`${m[1] ?? ""}${m[2]}`);
    else if (/^\s*\.\.\./.test(segmento)) chaves.push("...");
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
    if (nível === 0 || "{[(".includes(ch)) segmento += ch;
  }
  fechar();
  return chaves;
}

type Escrita = {
  ficheiro: string;
  linha: number;
  tabela: string;
  operacao: string;
  chaves: string[];
};

function escritasLiterais(): Escrita[] {
  const achados: Escrita[] = [];
  const padrão = /\.from\(\s*["'`]([a-z_]+)["'`]\s*\)\s*\.(insert|upsert)\(\s*\{/g;
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = resolve(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry)) continue;
      const código = semComentarios(readFileSync(full, "utf8"));
      for (const m of código.matchAll(padrão)) {
        const início = (m.index ?? 0) + m[0].length - 1;
        let profundidade = 0;
        let fim = início;
        for (; fim < código.length; fim++) {
          if (código[fim] === "{") profundidade++;
          else if (código[fim] === "}" && --profundidade === 0) break;
        }
        achados.push({
          ficheiro: relative(REPO, full),
          linha: código.slice(0, m.index).split("\n").length,
          tabela: m[1]!,
          operacao: m[2]!,
          chaves: chavesDeTopo(código.slice(início + 1, fim)),
        });
      }
    }
  };
  walk(resolve(REPO, "src"));
  return achados;
}

describe("colunas obrigatórias nas escritas", () => {
  it("o retrato traz as colunas obrigatórias", () => {
    const comObrigatorias = retrato.tabelas.filter((t) => (t.obrigatorias ?? []).length > 0);
    expect(
      comObrigatorias.length,
      "o retrato não tem `obrigatorias` — corra npm run siga:db-snapshot",
    ).toBeGreaterThan(100);
  });

  const escritas = escritasLiterais();

  it("encontra escritas suficientes para a verificação valer", () => {
    expect(escritas.length).toBeGreaterThan(80);
  });

  it("nenhum insert/upsert literal omite uma coluna obrigatória", () => {
    const erradas: string[] = [];
    for (const escrita of escritas) {
      if (escrita.chaves.some((c) => c.startsWith("..."))) continue;
      const obrigatorias = obrigatoriasPorTabela.get(escrita.tabela);
      if (!obrigatorias) continue;
      for (const coluna of obrigatorias) {
        if (escrita.chaves.includes(coluna)) continue;
        if (PREENCHIDAS_POR_TRIGGER.has(`${escrita.tabela}.${coluna}`)) continue;
        erradas.push(
          `${escrita.ficheiro}:${escrita.linha}: ${escrita.operacao} ${escrita.tabela} sem ${coluna}`,
        );
      }
    }
    expect(
      erradas,
      `Estas escritas omitem colunas NOT NULL sem valor por omissão: ${erradas.join("; ")}. ` +
        `A base recusa a linha inteira (também num upsert de uma linha que já existe).`,
    ).toEqual([]);
  });

  it("apanha os casos que já falharam", () => {
    expect(chavesDeTopo(` status: "issued", updated_at: now `)).toEqual(["status", "updated_at"]);
    expect(chavesDeTopo(`\n id, ...extra, nome: fn(a, b) `)).toEqual(["id", "...extra", "nome"]);
    expect(semComentarios(`a: 1, // x, y: 2\n b: 2`)).not.toContain("y: 2");
  });
});
