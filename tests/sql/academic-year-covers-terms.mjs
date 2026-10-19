// Ensaio local (PGlite) de 20261006180000_academic_year_dates_cover_terms.sql. Sem produção.
// Executar: SIGA_SQL_TEST_MODULE_PATH=<.../pglite/dist/index.js> node tests/sql/academic-year-covers-terms.mjs
const { PGlite } = await import(process.env["SIGA_SQL_TEST_MODULE_PATH"] || "@electric-sql/pglite");
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20261006180000_academic_year_dates_cover_terms.sql",
    import.meta.url,
  ),
  "utf8",
);

const db = new PGlite();
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated;
CREATE SCHEMA private;
CREATE TABLE public.academic_years (
  id uuid PRIMARY KEY, school_id uuid NOT NULL, name text NOT NULL,
  starts_on date NOT NULL, ends_on date NOT NULL, status text NOT NULL DEFAULT 'active');
CREATE TABLE public.terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid NOT NULL,
  academic_year_id uuid NOT NULL REFERENCES public.academic_years(id),
  name text NOT NULL, sequence int NOT NULL, starts_on date NOT NULL, ends_on date NOT NULL,
  CHECK (ends_on >= starts_on), UNIQUE (school_id, academic_year_id, sequence));
-- O gatilho dos períodos, tal como está na produção (public.guard_term_within_year).
CREATE FUNCTION public.guard_term_within_year() RETURNS trigger LANGUAGE plpgsql
SET search_path TO 'public' AS $f$
DECLARE y record;
BEGIN
  IF NEW.starts_on IS NOT NULL AND NEW.ends_on IS NOT NULL AND NEW.starts_on >= NEW.ends_on THEN
    RAISE EXCEPTION 'O período tem de terminar depois de começar.' USING ERRCODE = '23514';
  END IF;
  SELECT starts_on, ends_on INTO y FROM academic_years WHERE id = NEW.academic_year_id;
  IF FOUND AND (NEW.starts_on < y.starts_on OR NEW.ends_on > y.ends_on) THEN
    RAISE EXCEPTION 'O período tem de ficar dentro das datas do ano lectivo.' USING ERRCODE = '23514';
  END IF;
  IF COALESCE(current_setting('siga.defer_term_overlap', true), '') <> 'on'
     AND EXISTS (SELECT 1 FROM terms t WHERE t.id <> NEW.id AND t.academic_year_id = NEW.academic_year_id
             AND t.starts_on <= NEW.ends_on AND NEW.starts_on <= t.ends_on) THEN
    RAISE EXCEPTION 'O período sobrepõe-se a outro período do mesmo ano lectivo.' USING ERRCODE = '23P01';
  END IF;
  RETURN NEW;
END $f$;
CREATE TRIGGER trg_guard_term_within_year BEFORE INSERT OR UPDATE OF starts_on, ends_on, academic_year_id
  ON public.terms FOR EACH ROW EXECUTE FUNCTION public.guard_term_within_year();
`);

const S = "00000000-0000-0000-0000-00000000000a";
const Y = "00000000-0000-0000-0000-0000000000a1";
const ORPHAN_Y = "00000000-0000-0000-0000-0000000000a2";
await db.exec(`
INSERT INTO academic_years VALUES
  ('${Y}', '${S}', '2026/27', '2026-09-01', '2027-07-31'),
  ('${ORPHAN_Y}', '${S}', '2025/26', '2025-08-01', '2026-07-31');
INSERT INTO terms (school_id, academic_year_id, name, sequence, starts_on, ends_on) VALUES
  ('${S}', '${Y}', '1º Trimestre', 1, '2026-09-01', '2026-12-15'),
  ('${S}', '${Y}', '2º Trimestre', 2, '2027-01-05', '2027-04-01'),
  ('${S}', '${Y}', '3º Trimestre', 3, '2027-04-15', '2027-07-15');
`);

// Antes da migração: encurtar o ano deixa o 3º trimestre de fora, sem erro.
await db.exec("BEGIN");
await db.exec(`UPDATE academic_years SET ends_on = '2027-06-30' WHERE id = '${Y}'`);
await db.exec("ROLLBACK");

// O pacote para o SQL Editor leva esta migração tal e qual, e a consulta «Confirmar»
// do fim passa de «por aplicar» a «aplicada».
const pacote = readFileSync(
  new URL("../../docs/agents/SIGA_aplicar_auditoria13_2026-10-06.sql", import.meta.url),
  "utf8",
);
assert.ok(pacote.includes(migration));
const confirmar = pacote.slice(pacote.indexOf("-- ══════════ Confirmar ══════════"));
const sonda = async (coluna) => (await db.query(confirmar)).rows[0][coluna];
assert.equal(await sonda("20261006180000 datas do ano lectivo"), "por aplicar");
// A confirmação do bucket não parte a consulta onde não há storage.buckets.
assert.equal(await sonda("20261006181000 logótipos sem SVG"), "por aplicar");

// A migração corre duas vezes.
await db.exec(migration);
await db.exec(migration);
assert.equal(await sonda("20261006180000 datas do ano lectivo"), "aplicada");

async function commitFails(sql) {
  await db.exec("BEGIN");
  try {
    await db.exec(sql);
    await db.exec("COMMIT");
  } catch (error) {
    await db.exec("ROLLBACK").catch(() => {});
    return error;
  }
  return null;
}

// 1. Encurtar o ano para deixar um trimestre de fora é recusado no COMMIT, com o período.
const shrink = await commitFails(
  `UPDATE academic_years SET ends_on = '2027-06-30' WHERE id = '${Y}'`,
);
assert.ok(shrink, "encurtar o ano com um trimestre de fora devia falhar");
assert.match(String(shrink.message), /3º Trimestre/);
assert.match(String(shrink.message), /15\/07\/2027/);
const after = await db.query(`SELECT ends_on::text FROM academic_years WHERE id = '${Y}'`);
assert.equal(after.rows[0].ends_on, "2027-07-31");

// 2. O caminho de save_academic_calendar: ano primeiro, trimestres depois, na mesma
// transacção. Tem de passar (o gatilho é diferido).
assert.equal(
  await commitFails(`
    UPDATE academic_years SET ends_on = '2027-06-30' WHERE id = '${Y}';
    SELECT set_config('siga.defer_term_overlap', 'on', true);
    UPDATE terms SET ends_on = '2027-06-20' WHERE academic_year_id = '${Y}' AND sequence = 3;
  `),
  null,
);

// 3. Alargar o ano passa sempre.
assert.equal(
  await commitFails(`UPDATE academic_years SET starts_on = '2026-08-25' WHERE id = '${Y}'`),
  null,
);

// 4. Mudar o nome (as datas não mudam) não é bloqueado nem por um período órfão.
await db.exec(`
  ALTER TABLE terms DISABLE TRIGGER trg_guard_term_within_year;
  INSERT INTO terms (school_id, academic_year_id, name, sequence, starts_on, ends_on)
    VALUES ('${S}', '${ORPHAN_Y}', 'Período 4', 4, '2026-08-20', '2026-08-31');
  ALTER TABLE terms ENABLE TRIGGER trg_guard_term_within_year;
`);
assert.equal(
  await commitFails(`UPDATE academic_years SET name = '2025/2026' WHERE id = '${ORPHAN_Y}'`),
  null,
);
// O mesmo ano com as datas reescritas iguais (como faz o RPC) também passa.
assert.equal(
  await commitFails(
    `UPDATE academic_years SET starts_on = '2025-08-01', ends_on = '2026-07-31' WHERE id = '${ORPHAN_Y}'`,
  ),
  null,
);
// Mudar mesmo as datas pede primeiro o período corrigido.
const orphan = await commitFails(
  `UPDATE academic_years SET ends_on = '2026-07-30' WHERE id = '${ORPHAN_Y}'`,
);
assert.ok(orphan);
assert.match(String(orphan.message), /Período 4/);

// 5. Ninguém chama a função à mão.
const grants = await db.query(`
  SELECT has_function_privilege('authenticated', 'private.guard_academic_year_covers_terms()', 'EXECUTE') AS a,
         has_function_privilege('anon', 'private.guard_academic_year_covers_terms()', 'EXECUTE') AS b`);
assert.equal(grants.rows[0].a, false);
assert.equal(grants.rows[0].b, false);

console.log("academic-year-covers-terms: OK");
