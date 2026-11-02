// Ensaio PGlite local da função REAL public.current_school_id() da migração.
// Executado pela CI em tests/sql/*.mjs; nunca liga ao Supabase real.
// Valida a selecção de escola, vínculo activo, revogação e cabeçalhos adulterados.
const { PGlite } = await import(process.env.SIGA_SQL_TEST_MODULE_PATH || "@electric-sql/pglite");
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260930174857_audit_atomic_workflows_and_school_context.sql",
    import.meta.url,
  ),
  "utf8",
);

const start = migration.indexOf("CREATE OR REPLACE FUNCTION public.current_school_id()");
const grant = "GRANT EXECUTE ON FUNCTION public.current_school_id() TO authenticated, service_role;";
const end = migration.indexOf(grant, start);
assert.ok(start >= 0 && end > start, "a migração deve definir current_school_id com os seus grants");
const actualFunction = migration.slice(start, end + grant.length);

const db = new PGlite();
await db.exec(`
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE TABLE public.school_memberships (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  school_id uuid NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL
);
`);
await db.exec(actualFunction);

const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
const ADMIN_A = "10000000-0000-0000-0000-000000000001";
const USER_B = "10000000-0000-0000-0000-000000000002";
const DUAL = "10000000-0000-0000-0000-000000000003";
const NONE = "10000000-0000-0000-0000-000000000004";

await db.exec(`
INSERT INTO public.school_memberships(id, user_id, school_id, status, created_at)
VALUES
  ('20000000-0000-0000-0000-000000000001','${ADMIN_A}','${A}','active','2026-01-01'),
  ('20000000-0000-0000-0000-000000000002','${ADMIN_A}','${B}','inactive','2026-01-02'),
  ('20000000-0000-0000-0000-000000000003','${USER_B}','${B}','active','2026-01-01'),
  ('20000000-0000-0000-0000-000000000004','${DUAL}','${A}','active','2026-01-01'),
  ('20000000-0000-0000-0000-000000000005','${DUAL}','${B}','active','2026-01-02');
`);

async function withRole(role, user, headers, fn) {
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [user || ""]);
  await db.query("SELECT set_config('request.headers', $1, false)", [
    JSON.stringify(headers || {}),
  ]);
  await db.exec(`SET ROLE ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec("RESET ROLE");
  }
}

async function current(user, headers = {}, role = "authenticated") {
  return withRole(role, user, headers, async () => {
    const result = await db.query("SELECT public.current_school_id() AS school");
    return result.rows[0].school;
  });
}

// Sem sessão, a função não fabrica uma escola.
assert.equal(await current(null), null);
assert.equal(await current(NONE), null);

// Seleção padrão: primeiro vínculo activo, não o que foi suspenso.
assert.equal(await current(ADMIN_A), A);
assert.equal(await current(USER_B), B);
assert.equal(await current(DUAL), A);

// Um utilizador pode seleccionar apenas uma escola com vínculo activo.
assert.equal(await current(ADMIN_A, { "x-siga-school-id": A }), A);
assert.equal(await current(DUAL, { "x-siga-school-id": B }), B);

// Tentativas de falsificar o cabeçalho não podem selecionar outra escola.
await assert.rejects(
  current(ADMIN_A, { "x-siga-school-id": B }),
  /Sem vínculo activo/,
);
await assert.rejects(
  current(USER_B, { "x-siga-school-id": A }),
  /Sem vínculo activo/,
);
await assert.rejects(
  current(NONE, { "x-siga-school-id": A }),
  /Sem vínculo activo/,
);
await assert.rejects(
  current(ADMIN_A, { "x-siga-school-id": "nao-e-uuid" }),
  /Escola seleccionada inválida/,
);

// Revogar o vínculo deve invalidar imediatamente o selector da escola.
await db.query(
  "UPDATE public.school_memberships SET status='inactive' WHERE user_id=$1 AND school_id=$2",
  [DUAL, B],
);
await assert.rejects(
  current(DUAL, { "x-siga-school-id": B }),
  /Sem vínculo activo/,
);
assert.equal(await current(DUAL), A);

// Nem papel anon, nem bypass de SELECT à tabela por autenticados.
await assert.rejects(
  current(ADMIN_A, { "x-siga-school-id": A }, "anon"),
  /permission denied/,
);
await assert.rejects(
  withRole("authenticated", ADMIN_A, {}, () =>
    db.query("SELECT * FROM public.school_memberships"),
  ),
  /permission denied/,
);

console.log("current-school-context-isolation: todas as verificações passaram");
