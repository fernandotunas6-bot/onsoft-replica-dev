// Ensaio local (PGlite) de 20261025070203_saas_audit_logs_server_only.sql. Sem produção.
// Executar: SIGA_SQL_TEST_MODULE_PATH=<.../pglite/dist/index.js> node tests/sql/saas-audit-logs-server-only.mjs
const { PGlite } = await import(process.env["SIGA_SQL_TEST_MODULE_PATH"] || "@electric-sql/pglite");
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../../supabase/migrations/20261025070203_saas_audit_logs_server_only.sql");
const pacote = read("../../docs/agents/SIGA_aplicar_auditoria14_2026-10-10.sql");
assert.ok(pacote.includes(migration), "o pacote leva a migração tal e qual");

const db = new PGlite();
// Como na produção (leitura de 2026-10-17).
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE TABLE public.platform_admins (user_id uuid PRIMARY KEY);
CREATE FUNCTION public.is_platform_admin() RETURNS boolean LANGUAGE sql AS 'SELECT true';
CREATE TABLE public.saas_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, user_id uuid,
  action text NOT NULL, entity text NOT NULL, entity_id text, metadata jsonb,
  ip_address text, created_at timestamptz DEFAULT now());
ALTER TABLE public.saas_audit_logs ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.saas_audit_logs TO authenticated;
CREATE POLICY platform_admin_all_saas_audit_logs ON public.saas_audit_logs FOR ALL
  TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
INSERT INTO public.saas_audit_logs (action, entity) VALUES ('TENANT_PAYMENT', 'tenant');
`);
const sonda = async () =>
  (await db.query(pacote.slice(pacote.indexOf("-- ══════════ Confirmar ══════════")))).rows[0][
    "20261017100000 auditoria do ADMIN"
  ];
const asAuthenticated = async (sql) => {
  await db.exec("SET ROLE authenticated");
  try {
    return await db.query(sql);
  } finally {
    await db.exec("RESET ROLE");
  }
};

// Antes: um administrador da plataforma apagava o registo.
await asAuthenticated("DELETE FROM public.saas_audit_logs");
assert.equal(
  (await db.query("SELECT count(*)::int AS n FROM public.saas_audit_logs")).rows[0].n,
  0,
);
await db.exec(
  "INSERT INTO public.saas_audit_logs (action, entity) VALUES ('TENANT_PAYMENT', 'tenant')",
);
assert.equal(await sonda(), "por aplicar");

await db.exec(migration);
await db.exec(migration);
assert.equal(await sonda(), "aplicada");

for (const sql of [
  "SELECT * FROM public.saas_audit_logs",
  "DELETE FROM public.saas_audit_logs",
  "UPDATE public.saas_audit_logs SET action = 'x'",
  "INSERT INTO public.saas_audit_logs (action, entity) VALUES ('x', 'y')",
]) {
  await assert.rejects(asAuthenticated(sql), /permission denied/, sql);
}
await db.exec("SET ROLE service_role");
assert.equal(
  (await db.query("SELECT count(*)::int AS n FROM public.saas_audit_logs")).rows[0].n,
  1,
);
await db.exec("RESET ROLE");

console.log("saas-audit-logs-server-only: só o servidor lê e escreve; idempotente.");
