import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Completude do SQL versionado, não postura de segurança.
 *
 * Este ficheiro lê o SQL do repositório e responde a uma pergunta só: o que
 * está **declarado** aqui. Não responde ao que está **aplicado** na base — e a
 * diferença entre as duas coisas provou-se grande. A produção tem um schema
 * `private` com 95 funções, um modelo de permissões próprio, e RLS em tabelas
 * que este repositório nem sabe criar.
 *
 * A distinção não é académica: uma versão anterior deste ficheiro tratava a
 * lista de «sem RLS declarada» como «desprotegidas» e deu origem a uma migração
 * que teria acrescentado políticas redundantes a tabelas já protegidas.
 *
 * Para a postura real existe `rls-live-probe.test.ts`, que pergunta à base.
 * Para o esquema de produção deixar de ser invisível, existe o OPS-01.
 */

const REPO = resolve(__dirname, "../..");

/**
 * Tabelas com `school_id` sem RLS declarada **no repositório**.
 *
 * Atenção à formulação, porque foi corrigida à custa de um erro. A versão
 * anterior tratava esta lista como «tabelas desprotegidas» e deu origem a uma
 * migração que quase foi aplicada. Ao consultar a produção a 2026-09-12,
 * verificou-se que **todas estas já têm `relrowsecurity = true` e políticas** —
 * a maioria três cada. O que falta é a declaração no repositório, não a
 * protecção na base.
 *
 * Ou seja: este ficheiro mede a completude do SQL versionado, não a postura de
 * segurança. Quem quiser a postura real tem `rls-live-probe.test.ts`, que
 * pergunta à base. Enquanto o esquema de produção não estiver sob controlo de
 * versões (OPS-01), os dois números continuam a divergir e é preciso saber qual
 * se está a ler.
 */
const RLS_PENDING = new Set<string>([
  "academic_schedules",
  "curricula",
  "curriculum_areas",
  "curriculum_subjects",
  "hr_compensation_events",
  "hr_contracts",
  "hr_departments",
  "hr_employments",
  "hr_payroll_item_components",
  "hr_payroll_items",
  "hr_payroll_runs",
  "hr_positions",
  // Eliminada da produção pela migração 20260925090000 (docs/auditoria/08-auditoria.md,
  // 8.5/8.6 -- RLS activa e zero políticas, 0 linhas, confundia-se com `notifications`).
  // Fica na lista só porque o CREATE TABLE original (20260911120000) continua no
  // histórico de migrações que este teste varre -- não se edita migração já aplicada.
  "notification_preferences",
  "school_shift_slots",
  "school_shifts",
  "subject_types",
  "teacher_availability",
]);

/**
 * Tabelas que a aplicação consulta e que não têm `CREATE TABLE` em lado nenhum
 * do repositório.
 *
 * Eram 23 e a razão era sempre a mesma: existiam só na base de produção, e o
 * código alterava-as sem as saber criar. A 2026-09-14 foram capturadas 18
 * delas — o DDL real, lido do catálogo do Postgres, está em
 * `supabase/migrations/20260914151906_capture_undeclared_production_tables.sql`
 * (ver `npm run siga:db-ddl`). Inclui a camada financeira completa
 * (`finance_invoices`, `finance_receipts`, `finance_contracts`, `fee_plans`,
 * `fee_items`) e `school_integration_secrets`, que antes não era possível
 * proteger sem adivinhar o esquema.
 *
 * As que sobram não estão aqui pela razão antiga — não existem na produção
 * **nem** no repositório. São consultas a tabelas que não existem em lado
 * nenhum, e a lista de `tests/security/production-snapshot.test.ts`
 * (`TABELAS_AUSENTES_DA_PRODUCAO`) é que as conta e explica. `avatars` é o
 * falso positivo do conjunto: é um bucket de storage, não uma tabela.
 *
 * Eram cinco até 2026-09-16. `contact_verification_profiles` e
 * `user_communication_preferences` saíram com
 * `20260916130000_contact_verification_and_communication_preferences.sql`, que
 * foi declarada **e aplicada** nesse dia: deixaram de faltar em qualquer dos
 * lados, e saíram também da lista de `production-snapshot.test.ts`.
 *
 * `assessment_rule_sets` saiu no mesmo dia, com
 * `20260916140000_assessment_rule_sets.sql`. A forma não foi adivinhada: é a que
 * `private.publish_assessment_rule_version` — função que existe em produção —
 * insere, coluna a coluna. Enquanto a migração não for aplicada, essa função e
 * `configure_assessment_rules` falham com 42P01, e uma escola nova não consegue
 * abrir o primeiro diário de notas (`gradebooks.rule_set_id` é NOT NULL).
 */
/**
 * `tenant_mailboxes` saiu a 2026-09-23 com `20260923120000_tenant_mailboxes.sql`.
 *
 * Não é o `supabase/APPLY_MAILBOXES.sql` que estava à espera desde Setembro: esse
 * declarava a política de leitura por `tenant_members`, tabela que **não existe em
 * produção**, e teria falhado com 42P01 a meio — tabela criada, uma política aplicada e a
 * outra não. A migração nova segue o caminho real, `school_memberships` → `schools.tenant_id`.
 *
 * Continua **ausente da produção** enquanto a migração não for aplicada; isso é a outra
 * lista (`TABELAS_AUSENTES_DA_PRODUCAO`), e é lá que continua registada. Esta mede
 * declaração no repositório.
 *
 * Sobra `avatars`, que é o falso positivo do conjunto: é um bucket de storage, não uma
 * tabela.
 */
const SCHEMA_ONLY_IN_PRODUCTION = new Set(["avatars"]);

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

  it("o repositório continua a não descrever a protecção do núcleo de RH", () => {
    // Precisão importa aqui. Das tabelas `hr_*`, a maioria tem RLS declarada no
    // repositório — assiduidade, pagamentos, vínculos docentes. As que faltam
    // são exactamente as oito de contratos e processamento salarial.
    //
    // Não é um alarme: em produção estão protegidas, com RLS activo e três
    // políticas cada, confirmado a 2026-09-12. É um marcador da divergência
    // entre o que o repositório descreve e o que a base faz.
    const CORE_HR_UNDECLARED = [
      "hr_compensation_events",
      "hr_contracts",
      "hr_departments",
      "hr_employments",
      "hr_payroll_item_components",
      "hr_payroll_items",
      "hr_payroll_runs",
      "hr_positions",
    ];

    const undeclared = schoolTables
      .filter((table) => table.startsWith("hr_") && !rlsEnabled.has(table))
      .sort();

    expect(
      undeclared,
      undeclared.length < CORE_HR_UNDECLARED.length
        ? `Passaram a ter RLS declarada no repositório tabelas que não tinham. ` +
            `Boa notícia — remova-as de RLS_PENDING e desta lista.`
        : `Mais tabelas de RH ficaram sem declaração: ${undeclared.join(", ")}.`,
    ).toEqual(CORE_HR_UNDECLARED);
  });
});
