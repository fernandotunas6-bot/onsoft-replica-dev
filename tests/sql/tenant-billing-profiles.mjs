// Ensaio local (PGlite) de 20261015120000_tenant_billing_profiles.sql. Sem produção.
// Uso: SIGA_SQL_TEST_MODULE_PATH=<.../pglite/dist/index.js> node tests/sql/tenant-billing-profiles.mjs
const { PGlite } = await import(process.env["SIGA_SQL_TEST_MODULE_PATH"] || "@electric-sql/pglite");
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const db = new PGlite();
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE TABLE public.tenants (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL);
CREATE FUNCTION public.siga_touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS
  $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
`);

const migracao = read("../../supabase/migrations/20261015120000_tenant_billing_profiles.sql");
// A sonda de SIGA_confirmar_migracoes.sql para esta migração, avaliada sozinha (o
// ficheiro inteiro pergunta por tabelas que este cenário não tem).
const confirmar = read("../../docs/agents/SIGA_confirmar_migracoes.sql");
const inicio = confirmar.indexOf("('20261015120000_tenant_billing_profiles',");
assert.ok(inicio > 0, "sonda em falta em SIGA_confirmar_migracoes.sql");
const expressao = confirmar
  .slice(inicio + "('20261015120000_tenant_billing_profiles',".length)
  .split(/\)\n\) as m\(migracao, ok\)/)[0];
const sonda = async () =>
  (await db.query(`select (${expressao}) as ok`)).rows[0].ok ? "aplicada" : "EM FALTA";

// O pacote para o SQL Editor leva a migração tal e qual, e a consulta do fim passa
// de «por aplicar» a «aplicada».
const pacote = read("../../docs/agents/SIGA_aplicar_cobranca_escolas.sql");
assert.ok(pacote.includes(migracao));
const confirmarPacote = pacote.slice(pacote.indexOf("-- ══════════ Confirmar ══════════"));
const sondaPacote = async () =>
  (await db.query(confirmarPacote)).rows[0]["20261015120000 cobrança por escola"];

assert.equal(await sonda(), "EM FALTA");
assert.equal(await sondaPacote(), "por aplicar");
await db.exec(pacote);
await db.exec(pacote); // idempotente
assert.equal(await sonda(), "aplicada");
assert.equal(await sondaPacote(), "aplicada");

// Só o servidor.
const priv = (role, p) =>
  db
    .query("select has_table_privilege($1, 'public.tenant_billing_profiles', $2) as v", [role, p])
    .then((r) => r.rows[0].v);
for (const role of ["anon", "authenticated"]) {
  for (const p of ["SELECT", "INSERT", "UPDATE", "DELETE"])
    assert.equal(await priv(role, p), false, `${role} ${p}`);
}
assert.equal(await priv("service_role", "SELECT"), true);
const rls = (
  await db.query(
    "select relrowsecurity, relforcerowsecurity from pg_class where oid = 'public.tenant_billing_profiles'::regclass",
  )
).rows[0];
assert.deepEqual(rls, { relrowsecurity: true, relforcerowsecurity: true });

const [{ id: t1 }] = (await db.query("insert into tenants (name) values ('A') returning id")).rows;
const [{ id: t2 }] = (await db.query("insert into tenants (name) values ('B') returning id")).rows;

// Por omissão: privada, tabela do plano, mensal, transferência.
await db.query("insert into tenant_billing_profiles (tenant_id) values ($1)", [t1]);
const def = (await db.query("select * from tenant_billing_profiles where tenant_id = $1", [t1]))
  .rows[0];
assert.equal(def.institution_type, "private");
assert.equal(def.pricing_model, "plan");
assert.equal(def.billing_period, "monthly");
assert.deepEqual(def.payment_methods, ["bank_transfer"]);
assert.equal(def.public_review_status, "not_applicable");

const recusa = async (sql, params, porque) => {
  await assert.rejects(db.query(sql, params), undefined, porque);
};
const upd = "update tenant_billing_profiles set ";
const where = " where tenant_id = $1";
await recusa(upd + "pricing_model = 'per_student'" + where, [t1], "por aluno sem preço");
await recusa(upd + "pricing_model = 'fixed'" + where, [t1], "fixo sem valor");
await recusa(upd + "discount_pct = 120" + where, [t1], "desconto > 100");
await recusa(upd + "due_day = 31" + where, [t1], "dia 31 não existe em todos os meses");
await recusa(upd + "grace_days = 90" + where, [t1], "tolerância demasiado longa");
await recusa(upd + "payment_methods = ARRAY[]::text[]" + where, [t1], "sem método");
await recusa(upd + "payment_methods = ARRAY['bitcoin']" + where, [t1], "método desconhecido");
await recusa(upd + "billing_period = 'weekly'" + where, [t1], "periodicidade desconhecida");
await recusa(upd + "billing_paused = true" + where, [t1], "pausa sem motivo");
await recusa(
  upd + "public_review_status = 'approved'" + where,
  [t1],
  "privada aprovada como pública",
);
await recusa(upd + "public_requirements = '[]'::jsonb" + where, [t1], "requisitos não são objecto");
await recusa(upd + "currency_code = 'USD'" + where, [t1], "outra moeda");

// Por aluno, com mínimo; pausa com motivo; escola pública aprovada.
await db.query(
  upd +
    "pricing_model = 'per_student', price_per_student_aoa = 350, min_billable_students = 100, payment_methods = ARRAY['bank_transfer','multicaixa_express']" +
    where,
  [t1],
);
await db.query(
  "insert into tenant_billing_profiles (tenant_id, institution_type, public_review_status, billing_paused, billing_paused_reason) values ($1, 'public', 'pending', true, 'Escola pública em revisão')",
  [t2],
);
await db.query(upd + "public_review_status = 'approved', billing_paused = false" + where, [t2]);

// updated_at muda; apagar o tenant leva o perfil.
const before = (
  await db.query("select updated_at from tenant_billing_profiles where tenant_id = $1", [t1])
).rows[0].updated_at;
await new Promise((r) => setTimeout(r, 5));
await db.query(upd + "notes = 'x'" + where, [t1]);
const after = (
  await db.query("select updated_at from tenant_billing_profiles where tenant_id = $1", [t1])
).rows[0].updated_at;
assert.ok(after > before);
await db.query("delete from tenants where id = $1", [t2]);
assert.equal(
  (await db.query("select count(*)::int as n from tenant_billing_profiles")).rows[0].n,
  1,
);

console.log("tenant-billing-profiles: OK");
