/**
 * Ensaio sem rede externa da função real current_school_id() num PostgreSQL 17.
 * A conexão é apenas com a BD temporária criada pelo GitHub Actions.
 * Não depende de Supabase Auth, não copia dados escolares e não é staging E2E.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import postgres from "postgres";

const uri = process.env.SIGA_SECURITY_PG_TEST_URL;
if (!uri) throw new Error("Falta o PostgreSQL local de segurança do CI.");
const target = new URL(uri);
if (
  !["127.0.0.1", "localhost"].includes(target.hostname) ||
  target.pathname !== "/siga_security_ci" ||
  target.username !== "postgres" ||
  !target.password
) {
  throw new Error("Bloqueado: apenas a base PostgreSQL local de CI é permitida.");
}

const sql = postgres(uri, { max: 2, connect_timeout: 10, idle_timeout: 5, prepare: false });
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
assert.ok(start >= 0 && end > start, "A migração original tem de incluir a função e os grants.");

const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
const ADMIN_A = "10000000-0000-0000-0000-000000000001";
const USER_B = "10000000-0000-0000-0000-000000000002";
const DUAL = "10000000-0000-0000-0000-000000000003";
const NONE = "10000000-0000-0000-0000-000000000004";

async function current(role, user, headers = {}) {
  assert.ok(["anon", "authenticated"].includes(role));
  return sql.begin(async (tx) => {
    await tx`SELECT set_config('request.jwt.claim.sub', ${user ?? ""}, true)`;
    await tx`SELECT set_config('request.headers', ${JSON.stringify(headers)}, true)`;
    await tx.unsafe(`SET LOCAL ROLE ${role}`);
    const [row] = await tx`SELECT public.current_school_id() AS school`;
    return row.school;
  });
}

try {
  await sql.unsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role NOLOGIN;
      END IF;
    END $$;
    CREATE SCHEMA IF NOT EXISTS auth;
    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE TABLE public.school_memberships (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL,
      school_id uuid NOT NULL,
      status text NOT NULL,
      created_at timestamptz NOT NULL
    );
    ALTER TABLE public.school_memberships ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.school_memberships FORCE ROW LEVEL SECURITY;
    REVOKE ALL ON public.school_memberships FROM PUBLIC, anon, authenticated;
  `);
  await sql.unsafe(migration.slice(start, end + grant.length));

  await sql.unsafe(`
    INSERT INTO public.school_memberships(id,user_id,school_id,status,created_at)
    VALUES
      ('20000000-0000-0000-0000-000000000001','${ADMIN_A}','${A}','active','2026-01-01'),
      ('20000000-0000-0000-0000-000000000002','${ADMIN_A}','${B}','inactive','2026-01-02'),
      ('20000000-0000-0000-0000-000000000003','${USER_B}','${B}','active','2026-01-01'),
      ('20000000-0000-0000-0000-000000000004','${DUAL}','${A}','active','2026-01-01'),
      ('20000000-0000-0000-0000-000000000005','${DUAL}','${B}','active','2026-01-02');
  `);

  assert.equal(await current("authenticated", ADMIN_A), A);
  assert.equal(await current("authenticated", USER_B), B);
  assert.equal(await current("authenticated", DUAL), A);
  assert.equal(await current("authenticated", NONE), null);
  assert.equal(await current("authenticated", ""), null);
  assert.equal(await current("authenticated", DUAL, { "x-siga-school-id": B }), B);

  await assert.rejects(
    current("authenticated", ADMIN_A, { "x-siga-school-id": B }),
    /Sem vínculo activo/,
  );
  await assert.rejects(
    current("authenticated", USER_B, { "x-siga-school-id": A }),
    /Sem vínculo activo/,
  );
  await assert.rejects(
    current("authenticated", ADMIN_A, { "x-siga-school-id": "invalid-uuid" }),
    /Escola seleccionada inválida/,
  );

  await sql`
    UPDATE public.school_memberships SET status = 'inactive'
    WHERE user_id = ${DUAL}::uuid AND school_id = ${B}::uuid
  `;
  await assert.rejects(
    current("authenticated", DUAL, { "x-siga-school-id": B }),
    /Sem vínculo activo/,
  );
  assert.equal(await current("authenticated", DUAL), A);

  await assert.rejects(
    current("anon", ADMIN_A, { "x-siga-school-id": A }),
    /permission denied/i,
  );
  await assert.rejects(
    sql.begin(async (tx) => {
      await tx.unsafe("SET LOCAL ROLE authenticated");
      return tx`SELECT * FROM public.school_memberships`;
    }),
    /permission denied/i,
  );

  console.log("postgres-real-school-context: isolamento de duas escolas e revogação aprovados");
} finally {
  await sql.end({ timeout: 5 });
}
