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

/**
 * Tabelas que a aplicação consulta e que não têm `CREATE TABLE` em lado nenhum
 * do repositório: existem apenas na base de produção. O código altera-as, indexa-as
 * e consulta-as, mas não as sabe criar.
 *
 * Catorze destas não têm sequer RLS declarado — incluindo a camada financeira
 * completa (`finance_invoices`, `finance_receipts`, `finance_contracts`,
 * `fee_plans`, `fee_items`) e `school_integration_secrets`. Não é possível
 * escrever-lhes políticas a partir daqui sem adivinhar o esquema, e adivinhar
 * políticas para a tabela do dinheiro é pior do que não ter nenhuma.
 *
 * É esta a razão por que extrair o esquema de produção com `pg_dump --schema-only`
 * e commitá-lo é o passo que desbloqueia todos os outros. A lista existe para
 * encolher até zero.
 */
const SCHEMA_ONLY_IN_PRODUCTION = new Set([
  "academic_levels",
  "assessment_rule_sets",
  "avatars",
  "campuses",
  "class_subjects",
  "contact_verification_profiles",
  "document_sequences",
  "fee_items",
  "fee_plans",
  "finance_contracts",
  "finance_invoices",
  "finance_receipts",
  "grade_items",
  "grade_scores",
  "gradebooks",
  "programs",
  "school_integration_secrets",
  "siga_lesson_meetings",
  "teachers",
  "tenant_mailboxes",
  "terms",
  "timetable_slots",
  "user_communication_preferences",
]);

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

/**
 * Insensível a maiúsculas de propósito. A primeira versão deste ficheiro não o
 * era e não via as tabelas declaradas em minúsculas — `APPLY_ALUMNI_MODULE.sql`
 * usa `create table if not exists`. Faltavam-lhe 35 tabelas, e um teste que
 * inspecciona menos do que diz é pior do que não existir.
 */
function tablesWithSchoolId(): string[] {
  const found = new Set<string>();
  const createTable = /CREATE TABLE\s+(?:IF NOT EXISTS\s+)?public\.(\w+)\s*\(([\s\S]*?)\n\);/gi;
  for (const match of sql.matchAll(createTable)) {
    const [, name, body] = match;
    if (/\bschool_id\b/i.test(body)) found.add(name.toLowerCase());
  }
  return [...found].sort();
}

const declaredTables = new Set(
  [...sql.matchAll(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?public\.(\w+)/gi)].map((match) =>
    match[1].toLowerCase(),
  ),
);

const rlsEnabled = new Set(
  [...sql.matchAll(/ALTER TABLE\s+(?:public\.)?(\w+)\s+ENABLE ROW LEVEL SECURITY/gi)].map((match) =>
    match[1].toLowerCase(),
  ),
);

/** Tabelas que a aplicação consulta, lidas dos `.from("…")` em src/. */
function tablesUsedByApp(): string[] {
  const found = new Set<string>();
  const roots = [resolve(REPO, "src")];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = resolve(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry)) {
        const code = readFileSync(full, "utf8");
        for (const m of code.matchAll(/\.from\(\s*["'`]([a-z_]+)["'`]\s*\)/g)) found.add(m[1]);
      }
    }
  };
  roots.forEach(walk);
  return [...found].sort();
}

const schoolTables = tablesWithSchoolId();
const appTables = tablesUsedByApp();

describe("RLS nas tabelas com school_id", () => {
  it("inspecciona o conjunto que diz inspeccionar", () => {
    // Limiares apertados de propósito. A primeira versão deste ficheiro usava
    // regex sensível a maiúsculas e via 98 tabelas em vez de 114 — passava a
    // verde enquanto ignorava um sexto do esquema. Um número frouxo aqui
    // esconderia a próxima regressão do mesmo tipo.
    expect(sqlFiles.length).toBeGreaterThan(100);
    expect(declaredTables.size).toBeGreaterThanOrEqual(130);
    expect(schoolTables.length).toBeGreaterThanOrEqual(110);
    expect(appTables.length).toBeGreaterThan(100);
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

  it("nenhuma tabela nova passa a ser usada sem existir no repositório", () => {
    const invisible = appTables.filter((table) => !declaredTables.has(table));
    const unexpected = invisible.filter((table) => !SCHEMA_ONLY_IN_PRODUCTION.has(table));
    expect(
      unexpected,
      `A aplicação consulta estas tabelas, mas não existe CREATE TABLE para elas ` +
        `em lado nenhum do repositório: ${unexpected.join(", ")}. Significa que a ` +
        `produção é a única fonte de verdade do seu próprio esquema — não é ` +
        `reconstruível, não é revisível, e nenhum teste consegue verificar as ` +
        `suas políticas. Acrescente a definição, ou junte à lista com justificação.`,
    ).toEqual([]);
  });

  it("a lista de esquema-só-em-produção não tem entradas obsoletas", () => {
    const stale = [...SCHEMA_ONLY_IN_PRODUCTION].filter((table) => declaredTables.has(table));
    expect(
      stale,
      `entradas já declaradas no repositório e que podem sair da lista: ${stale.join(", ")}`,
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
