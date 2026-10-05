// Ensaio local (PGlite) de 20261005010000_assessment_closed_term_guard.sql.
// Sem produção. Executar: SIGA_SQL_TEST_MODULE_PATH=<.../pglite/dist/index.js> node tests/sql/assessment-closed-term.mjs
const { PGlite } = await import(process.env["SIGA_SQL_TEST_MODULE_PATH"] || "@electric-sql/pglite");
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const db = new PGlite();
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA private; CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
-- Cópia da função de produção.
CREATE FUNCTION private.sga_request_is_service_role() RETURNS boolean LANGUAGE sql STABLE AS
  $$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), current_user) = 'service_role' $$;
CREATE TABLE public.class_groups (id uuid PRIMARY KEY, school_id uuid NOT NULL, academic_year_id uuid);
CREATE TABLE public.terms (id uuid PRIMARY KEY, school_id uuid NOT NULL, academic_year_id uuid NOT NULL, sequence int NOT NULL);
CREATE TABLE public.grade_sheets (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid NOT NULL,
  class_group_id uuid NOT NULL, term_id uuid, kind text NOT NULL, status text NOT NULL);
CREATE TABLE public.siga_assessment_items (id uuid PRIMARY KEY, school_id uuid NOT NULL,
  class_group_id uuid NOT NULL, term int NOT NULL, name text);
CREATE TABLE public.siga_assessment_scores (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid NOT NULL,
  item_id uuid NOT NULL, enrollment_id uuid, score numeric);
GRANT USAGE ON SCHEMA public, private, auth TO authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.sga_request_is_service_role() TO authenticated, service_role;
`);
const mig = readFileSync(
  new URL(
    "../../supabase/migrations/20261005010000_assessment_closed_term_guard.sql",
    import.meta.url,
  ),
  "utf8",
);
await db.exec(mig);
await db.exec(mig); // idempotente

const S = "00000000-0000-0000-0000-00000000000a";
const Y = "00000000-0000-0000-0000-0000000000y1".replace("y", "0");
const CG = "00000000-0000-0000-0000-0000000000c1";
const CG2 = "00000000-0000-0000-0000-0000000000c2"; // sem ano lectivo
const T1 = "00000000-0000-0000-0000-0000000000a1";
const T2 = "00000000-0000-0000-0000-0000000000a2";
const I1 = "00000000-0000-0000-0000-0000000000b1"; // período 1
const I2 = "00000000-0000-0000-0000-0000000000b2"; // período 2
const I3 = "00000000-0000-0000-0000-0000000000b3"; // turma sem ano
const user = "00000000-0000-0000-0000-000000000001";
await db.exec(`
INSERT INTO class_groups VALUES ('${CG}','${S}','${Y}'),('${CG2}','${S}',NULL);
INSERT INTO terms VALUES ('${T1}','${S}','${Y}',1),('${T2}','${S}','${Y}',2);
INSERT INTO siga_assessment_items VALUES ('${I1}','${S}','${CG}',1,'T1'),('${I2}','${S}','${CG}',2,'T2'),('${I3}','${S}','${CG2}',1,'sem ano');
INSERT INTO siga_assessment_scores(id,school_id,item_id,score) VALUES
  ('00000000-0000-0000-0000-0000000000d1','${S}','${I1}',10),('00000000-0000-0000-0000-0000000000d2','${S}','${I2}',12);
`);

async function as(role, sub, sql) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [sub ?? ""]);
  await db.query("select set_config('request.jwt.claim.role',$1,false)", [role]);
  await db.exec(`SET ROLE ${role}`);
  try {
    return await db.query(sql);
  } finally {
    await db.exec("RESET ROLE");
    await db.query("select set_config('request.jwt.claim.role','',false)");
  }
}
const upd = (id) => `update siga_assessment_scores set score = 15 where id = '${id}'`;
const D1 = "00000000-0000-0000-0000-0000000000d1";
const D2 = "00000000-0000-0000-0000-0000000000d2";

// 1. Pauta ainda em rascunho: o utilizador escreve normalmente.
await db.exec(
  `INSERT INTO grade_sheets(school_id,class_group_id,term_id,kind,status) VALUES ('${S}','${CG}','${T1}','term','draft')`,
);
assert.equal((await as("authenticated", user, upd(D1))).affectedRows, 1);

// 2. Pauta do período 1 homologada: notas e avaliações do período 1 ficam fechadas.
await db.exec(`UPDATE grade_sheets SET status='homologated' WHERE term_id='${T1}'`);
await assert.rejects(as("authenticated", user, upd(D1)), /já é oficial/);
await assert.rejects(
  as("authenticated", user, `delete from siga_assessment_scores where id='${D1}'`),
  /já é oficial/,
);
await assert.rejects(
  as(
    "authenticated",
    user,
    `insert into siga_assessment_scores(school_id,item_id,score) values ('${S}','${I1}',9)`,
  ),
  /já é oficial/,
);
await assert.rejects(
  as("authenticated", user, `update siga_assessment_items set name='x' where id='${I1}'`),
  /já é oficial/,
);
await assert.rejects(
  as("authenticated", user, `delete from siga_assessment_items where id='${I1}'`),
  /já é oficial/,
);
await assert.rejects(
  as(
    "authenticated",
    user,
    `insert into siga_assessment_items values (gen_random_uuid(),'${S}','${CG}',1,'novo')`,
  ),
  /já é oficial/,
);
// Mover uma avaliação aberta para o período fechado também é recusado.
await assert.rejects(
  as("authenticated", user, `update siga_assessment_items set term=1 where id='${I2}'`),
  /já é oficial/,
);
// 3. O período 2 continua aberto.
assert.equal((await as("authenticated", user, upd(D2))).affectedRows, 1);
// 4. service_role (o servidor, que valida por si) e manutenção sem sessão não são afectados.
assert.equal((await as("service_role", user, upd(D1))).affectedRows, 1);
await db.query("select set_config('request.jwt.claim.sub','',false)");
assert.equal((await db.query(upd(D1))).affectedRows, 1);
// 5. Pauta anual oficial fecha todos os períodos da turma.
await db.exec(
  `INSERT INTO grade_sheets(school_id,class_group_id,term_id,kind,status) VALUES ('${S}','${CG}',NULL,'annual','published')`,
);
await assert.rejects(as("authenticated", user, upd(D2)), /já é oficial/);
// 6. Estados não oficiais (rectified, submitted) não fecham; turma sem ano lectivo não bloqueia (como o servidor).
await db.exec(`UPDATE grade_sheets SET status='rectified'`);
assert.equal((await as("authenticated", user, upd(D2))).affectedRows, 1);
await db.exec(`UPDATE grade_sheets SET status='closed'`);
assert.equal(
  (await as("authenticated", user, `update siga_assessment_items set name='ok' where id='${I3}'`))
    .affectedRows,
  1,
);
// 7. Outra turma da mesma escola não é afectada.
await db.exec(
  `INSERT INTO siga_assessment_items VALUES ('00000000-0000-0000-0000-0000000000b9','${S}','00000000-0000-0000-0000-0000000000c9',1,'outra')`,
);
assert.equal(
  (
    await as(
      "authenticated",
      user,
      `update siga_assessment_items set name='ok' where id='00000000-0000-0000-0000-0000000000b9'`,
    )
  ).affectedRows,
  1,
);

console.log("assessment-closed-term: todas as verificações passaram");
