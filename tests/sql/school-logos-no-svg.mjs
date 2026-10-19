// Ensaio local (PGlite) de 20261006181000_school_logos_no_svg.sql. Sem produção.
// Executar: SIGA_SQL_TEST_MODULE_PATH=<.../pglite/dist/index.js> node tests/sql/school-logos-no-svg.mjs
const { PGlite } = await import(process.env["SIGA_SQL_TEST_MODULE_PATH"] || "@electric-sql/pglite");
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const migration = readFileSync(
  new URL("../../supabase/migrations/20261006181000_school_logos_no_svg.sql", import.meta.url),
  "utf8",
);
const db = new PGlite();
// Os buckets como estão na produção (leitura de 2026-10-06).
await db.exec(`
CREATE SCHEMA storage;
CREATE TABLE storage.buckets (id text PRIMARY KEY, public boolean, file_size_limit bigint, allowed_mime_types text[]);
INSERT INTO storage.buckets VALUES
  ('school-logos', true, 2097152, ARRAY['image/png','image/jpeg','image/webp','image/svg+xml']),
  ('avatars', false, 5242880, ARRAY['image/png','image/jpeg','image/webp']),
  ('siga-files', false, 52428800, NULL);
`);

// O pacote para o SQL Editor leva esta migração tal e qual, e a consulta «Confirmar»
// do fim passa de «por aplicar» a «aplicada».
const pacote = readFileSync(
  new URL("../../docs/agents/SIGA_aplicar_auditoria13_2026-10-06.sql", import.meta.url),
  "utf8",
);
assert.ok(pacote.includes(migration));
const confirmar = pacote.slice(pacote.indexOf("-- ══════════ Confirmar ══════════"));
const sonda = async (coluna) => (await db.query(confirmar)).rows[0][coluna];
assert.equal(await sonda("20261006181000 logótipos sem SVG"), "por aplicar");

await db.exec(migration);
await db.exec(migration);
assert.equal(await sonda("20261006181000 logótipos sem SVG"), "aplicada");

const { rows } = await db.query(
  "SELECT id, public, file_size_limit, allowed_mime_types FROM storage.buckets ORDER BY id",
);
const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
assert.deepEqual(byId["school-logos"].allowed_mime_types, [
  "image/png",
  "image/jpeg",
  "image/webp",
]);
// O resto do bucket e os outros buckets ficam como estavam.
assert.equal(byId["school-logos"].public, true);
assert.equal(Number(byId["school-logos"].file_size_limit), 2097152);
assert.deepEqual(byId["avatars"].allowed_mime_types, ["image/png", "image/jpeg", "image/webp"]);
assert.equal(byId["siga-files"].allowed_mime_types, null);

console.log("school-logos-no-svg: OK");
