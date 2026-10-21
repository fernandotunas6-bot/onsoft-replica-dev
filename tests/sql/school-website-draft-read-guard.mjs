// Ensaio PostgreSQL/PGlite da migração real de protecção de rascunhos.
// Não usa credenciais, dados ou projectos Supabase de produção.
// O CI executa automaticamente todos os scripts tests/sql/*.mjs.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { PGlite } = await import(process.env["SIGA_SQL_TEST_MODULE_PATH"] || "@electric-sql/pglite");
const db = new PGlite();
const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";

try {
  // Fixture isolada que reproduz: SELECT do membro (policy permissiva),
  // função de permissão administrativa e tabela de domínios partilhados.
  await db.exec(`
    CREATE ROLE authenticated;
    CREATE ROLE anon;
    CREATE SCHEMA private;
    CREATE TABLE public.school_settings (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      school_id uuid NOT NULL,
      domain text NOT NULL,
      version integer NOT NULL,
      value jsonb NOT NULL
    );
    CREATE FUNCTION private.has_permission(school_id uuid, permission text)
    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
      SELECT current_setting('app.test.admin', true) = 'yes'
         AND school_id::text = current_setting('app.test.school_id', true)
         AND permission = 'schools.settings.create'
    $$;
    ALTER TABLE public.school_settings ENABLE ROW LEVEL SECURITY;
    GRANT SELECT ON public.school_settings TO authenticated, anon;
    CREATE POLICY settings_select_member
      ON public.school_settings
      FOR SELECT TO authenticated
      USING (school_id::text = current_setting('app.test.school_id', true));
    INSERT INTO public.school_settings (school_id, domain, version, value)
      VALUES
      ('${A}', 'school_website', 1, '{"draft":"SEGREDO A 1"}'),
      ('${A}', 'school_website', 2, '{"draft":"SEGREDO A 2"}'),
      ('${A}', 'billing', 1, '{"fee":0}'),
      ('${B}', 'school_website', 1, '{"draft":"SEGREDO B"}'),
      ('${B}', 'billing', 1, '{"fee":0}');
  `);

  const migration = readFileSync(
    new URL(
      "../../supabase/migrations/20261020213000_school_website_draft_read_guard.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await db.exec(migration);
  await db.exec(migration); // migração idempotente em base inicializada

  const { rows: policies } = await db.query(`
    SELECT policyname, permissive, cmd
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'school_settings'
    ORDER BY policyname
  `);
  assert.deepEqual(policies, [
    {
      policyname: "school_website_drafts_admin_read_guard",
      permissive: "RESTRICTIVE",
      cmd: "SELECT",
    },
    { policyname: "settings_select_member", permissive: "PERMISSIVE", cmd: "SELECT" },
  ]);

  async function visibleFor(role, school, admin) {
    await db.exec(role === "authenticated" ? "SET ROLE authenticated" : "SET ROLE anon");
    try {
      await db.query("SELECT set_config('app.test.school_id', $1, false)", [school]);
      await db.query("SELECT set_config('app.test.admin', $1, false)", [admin ? "yes" : "no"]);
      const { rows } = await db.query(
        "SELECT school_id::text AS school, domain, version FROM public.school_settings ORDER BY school, domain, version",
      );
      return rows;
    } finally {
      await db.exec("RESET ROLE");
    }
  }

  // Membro comum da escola A: pode ler outras definições, não rascunhos.
  assert.deepEqual(await visibleFor("authenticated", A, false), [
    { school: A, domain: "billing", version: 1 },
  ]);

  // Admin da escola A: pode ver todas as versões de A, nunca as de B.
  assert.deepEqual(await visibleFor("authenticated", A, true), [
    { school: A, domain: "billing", version: 1 },
    { school: A, domain: "school_website", version: 1 },
    { school: A, domain: "school_website", version: 2 },
  ]);

  // Administrador da escola B não pode ver nenhuma versão da escola A.
  assert.deepEqual(await visibleFor("authenticated", B, true), [
    { school: B, domain: "billing", version: 1 },
    { school: B, domain: "school_website", version: 1 },
  ]);

  // Ter papel administrativo sem membership não abre outra escola.
  assert.deepEqual(
    await visibleFor("authenticated", "00000000-0000-0000-0000-00000000000c", true),
    [],
  );

  // Nenhuma política permissiva publica dados para anon.
  assert.deepEqual(await visibleFor("anon", A, true), []);

  console.log("school-website-draft-read-guard: RLS real, 2 execuções, 5 perfis OK");
} finally {
  await db.close();
}
