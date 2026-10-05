// Ensaio local (PGlite) do pacote docs/agents/SIGA_aplicar_propina_por_classe.sql
// (migração 20261005150000). Sem produção.
// Uso: node tests/sql/fee-items-grade-level.mjs (ver tests/sql/README.md).
const { PGlite } = await import(process.env["SIGA_SQL_TEST_MODULE_PATH"] || "@electric-sql/pglite");
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const db = new PGlite();
// Chaves e restrições lidas da produção a 2026-10-05 (só as que esta migração toca), mais
// as tabelas que SIGA_confirmar_migracoes.sql pergunta.
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE TABLE public.schools (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.grade_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id),
  name text NOT NULL,
  CONSTRAINT grade_levels_school_id_id_key UNIQUE (school_id, id)
);
CREATE TABLE public.fee_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id),
  CONSTRAINT fee_plans_school_id_id_key UNIQUE (school_id, id)
);
CREATE TABLE public.fee_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id),
  fee_plan_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('enrollment', 'tuition', 'service', 'other')),
  amount numeric NOT NULL CHECK (amount >= 0),
  frequency text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fee_items_school_id_fee_plan_id_code_key UNIQUE (school_id, fee_plan_id, code),
  CONSTRAINT fee_items_school_id_unique UNIQUE (school_id, id),
  CONSTRAINT fee_items_school_id_fee_plan_id_fkey FOREIGN KEY (school_id, fee_plan_id)
    REFERENCES public.fee_plans(school_id, id)
);
CREATE TABLE public.finance_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  fee_item_id uuid NOT NULL,
  CONSTRAINT finance_invoices_school_id_fee_item_id_fkey FOREIGN KEY (school_id, fee_item_id)
    REFERENCES public.fee_items(school_id, id)
);
CREATE TABLE public.siga_direct_messages (id uuid PRIMARY KEY);
CREATE TABLE public.student_academic_history (id uuid PRIMARY KEY);
CREATE TABLE public.import_table_specs (table_schema text, table_name text, direct_import_policy text);
`);

const pacote = read("../../docs/agents/SIGA_aplicar_propina_por_classe.sql");
const confirmar = pacote.slice(pacote.indexOf("-- ══════════ Confirmar ══════════"));
const estado = async () => Object.values((await db.query(confirmar)).rows[0])[0];
const sonda = async () =>
  (await db.exec(read("../../docs/agents/SIGA_confirmar_migracoes.sql")))
    .at(-1)
    .rows.find((r) => r.migracao === "20261005150000_fee_items_grade_level").estado;

// O pacote leva a migração tal como está.
assert.ok(
  pacote.includes(read("../../supabase/migrations/20261005150000_fee_items_grade_level.sql")),
);

// Dados de antes: um plano com o preço geral, já usado numa fatura.
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const school = await one("insert into schools default values returning id");
const other = await one("insert into schools default values returning id");
const plan = await one("insert into fee_plans(school_id) values ($1) returning id", [school.id]);
const general = await one(
  `insert into fee_items(school_id, fee_plan_id, code, name, kind, amount, frequency)
   values ($1, $2, 'TUITION', 'Propina mensal', 'tuition', 25000, 'monthly') returning id`,
  [school.id, plan.id],
);
await db.query("insert into finance_invoices(school_id, fee_item_id) values ($1, $2)", [
  school.id,
  general.id,
]);

assert.equal(await estado(), "por aplicar");
assert.equal(await sonda(), "EM FALTA");

for (let corrida = 0; corrida < 2; corrida++) {
  assert.deepEqual((await db.exec(pacote)).at(-1).rows[0], {
    "20261005150000 propina por classe": "aplicada",
  });
}
assert.equal(await sonda(), "aplicada");

// O item que já existia fica como preço geral.
assert.deepEqual(
  await one("select grade_level_id, amount from fee_items where id = $1", [general.id]),
  {
    grade_level_id: null,
    amount: "25000",
  },
);

const g10 = await one(
  "insert into grade_levels(school_id, name) values ($1, '10ª Classe') returning id",
  [school.id],
);
const g7 = await one(
  "insert into grade_levels(school_id, name) values ($1, '7ª Classe') returning id",
  [school.id],
);
const foreign = await one(
  "insert into grade_levels(school_id, name) values ($1, '10ª Classe') returning id",
  [other.id],
);
const price = (grade, code, active = true) =>
  db.query(
    `insert into fee_items(school_id, fee_plan_id, code, name, kind, amount, frequency, is_active, grade_level_id)
     values ($1, $2, $3, 'Propina', 'tuition', 35000, 'monthly', $4, $5) returning id`,
    [school.id, plan.id, code, active, grade],
  );

const item10 = (await price(g10.id, `TUITION-${g10.id}`)).rows[0];
// Classe de outra escola: a chave composta recusa.
await assert.rejects(price(foreign.id, `TUITION-${foreign.id}`), /foreign key/);
// Um só preço activo por classe e tipo no plano; desligados podem ficar no histórico.
await assert.rejects(price(g10.id, "TUITION-10-B"), /duplicate key|unique/);
await price(g10.id, "TUITION-10-ANTIGO", false);
// Várias classes, e o preço geral (sem classe) não conta para o limite.
await price(g7.id, `TUITION-${g7.id}`);
await db.query(
  `insert into fee_items(school_id, fee_plan_id, code, name, kind, amount, frequency)
   values ($1, $2, 'TUITION-2', 'Outra propina geral', 'tuition', 26000, 'monthly')`,
  [school.id, plan.id],
);

// Apagar uma classe: o preço dela vai junto se nenhuma fatura o usar; com faturas, recusa.
await db.query("delete from grade_levels where id = $1", [g7.id]);
assert.equal(
  (await one("select count(*)::int as n from fee_items where grade_level_id = $1", [g7.id])).n,
  0,
);
await db.query("insert into finance_invoices(school_id, fee_item_id) values ($1, $2)", [
  school.id,
  item10.id,
]);
await assert.rejects(db.query("delete from grade_levels where id = $1", [g10.id]), /foreign key/);

console.log("fee-items-grade-level: pacote idempotente, sonda e restrições ok");
