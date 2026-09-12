import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Toda a tabela que carrega `school_id` guarda dados de uma escola concreta e,
 * num Postgres partilhado por N escolas, precisa de RLS — a linha só é visível
 * a quem pertence àquela escola.
 *
 * Hoje a aplicação lê quase tudo pelo cliente service_role, que ignora RLS, por
 * isso uma tabela sem política não é necessariamente explorável. Mas isso é
 * precisamente o problema: o isolamento fica a depender só da camada
 * TypeScript. Uma tabela sem RLS é uma fuga latente — basta alguém conceder
 * acesso ao papel `authenticated`, ou passar a lê-la pelo cliente do browser,
 * para deixar de haver rede por baixo.
 *
 * Este teste não substitui os testes pgTAP em `supabase/tests/` (que verificam
 * as políticas contra uma base real). Faz o que eles não podem fazer sem base
 * de dados: impedir que a lista de tabelas desprotegidas cresça.
 */

const REPO = resolve(__dirname, "../..");

/**
 * Dívida conhecida: tabelas com `school_id` para as quais ainda não existe RLS
 * declarado. Está vazia — as 17 que faltavam passaram a ter política em
 * `supabase/HARDEN_UNPROTECTED_SCHOOL_TABLES.sql`.
 *
 * Atenção ao que este teste mede: lê o SQL do repositório, portanto verifica
 * que a política está **escrita**, não que está **aplicada** em produção. Essa
 * distinção só desaparece quando o esquema de produção estiver sob controlo de
 * versões. Até lá, confirmar depois de aplicar:
 *
 *   select relname, relrowsecurity from pg_class where relname like 'hr_%';
 */
const RLS_PENDING = new Set<string>([]);

function collectSqlFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) collectSqlFiles(full, out);
    else if (entry.endsWith(".sql")) out.push(full);
  }
  return out;
}

const sqlFiles = [
  ...collectSqlFiles(resolve(REPO, "supabase")),
  resolve(REPO, "all_migrations_combined.sql"),
].filter((file) => existsSync(file));

const sql = sqlFiles.map((file) => readFileSync(file, "utf8")).join("\n");

/** Tabelas declaradas com uma coluna `school_id`. */
function tablesWithSchoolId(): string[] {
  const found = new Set<string>();
  const createTable = /CREATE TABLE (?:IF NOT EXISTS )?public\.(\w+)\s*\(([\s\S]*?)\n\);/g;
  for (const match of sql.matchAll(createTable)) {
    const [, name, body] = match;
    if (/\bschool_id\b/.test(body)) found.add(name);
  }
  return [...found].sort();
}

const rlsEnabled = new Set(
  [...sql.matchAll(/ALTER TABLE (?:public\.)?(\w+)\s+ENABLE ROW LEVEL SECURITY/g)].map(
    (match) => match[1],
  ),
);

const schoolTables = tablesWithSchoolId();

describe("RLS nas tabelas com school_id", () => {
  it("encontra ficheiros SQL e tabelas para inspeccionar", () => {
    expect(sqlFiles.length).toBeGreaterThan(5);
    expect(schoolTables.length).toBeGreaterThan(50);
  });

  it("nenhuma tabela nova fica sem RLS", () => {
    const unprotected = schoolTables.filter(
      (table) => !rlsEnabled.has(table) && !RLS_PENDING.has(table),
    );
    expect(
      unprotected,
      `Tabelas com school_id sem ENABLE ROW LEVEL SECURITY: ${unprotected.join(", ")}. ` +
        `Num Postgres partilhado por N escolas, uma tabela escolar sem política ` +
        `não tem rede por baixo da camada TypeScript. Acrescente a política — ` +
        `o padrão do projecto é USING (school_id = current_school_id()) — ou, se ` +
        `houver razão para adiar, junte à lista RLS_PENDING com justificação.`,
    ).toEqual([]);
  });

  it("a lista de dívida conhecida não tem entradas obsoletas", () => {
    const known = new Set(schoolTables);
    const stale = [...RLS_PENDING].filter((table) => !known.has(table));
    expect(
      stale,
      `entradas em RLS_PENDING que já não correspondem a tabelas com school_id: ${stale.join(", ")}`,
    ).toEqual([]);
  });

  it("as tabelas de RH e salários têm política declarada", () => {
    // Explícito por serem as de maior sensibilidade: contratos e vencimentos de
    // trabalhadores, não dados operacionais da escola.
    const hrTables = schoolTables.filter((table) => table.startsWith("hr_"));
    expect(hrTables.length).toBeGreaterThan(0);
    for (const table of hrTables) {
      expect(rlsEnabled.has(table), `${table} sem ENABLE ROW LEVEL SECURITY`).toBe(true);
    }
  });
});
