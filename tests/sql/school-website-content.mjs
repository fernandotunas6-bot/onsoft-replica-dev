// Ensaio local da política real, sem acesso à produção.
const { PGlite } = await import(process.env.SIGA_SQL_TEST_MODULE_PATH || "@electric-sql/pglite");
import fs from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
await db.exec(
  `CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE TABLE public.school_settings(id integer primary key,domain text not null,value jsonb);GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;GRANT ALL ON public.school_settings TO anon,authenticated,service_role;ALTER TABLE public.school_settings ENABLE ROW LEVEL SECURITY;CREATE POLICY fixture_permissive ON public.school_settings FOR ALL TO anon,authenticated USING(true) WITH CHECK(true);INSERT INTO school_settings VALUES(1,'academic','{}'),(2,'school_website','{"draft":"website private"}'),(3,'school_blog.noticia','{"draft":"blog private"}');`,
);
const sql = fs.readFileSync(
  new URL(
    "../../supabase/migrations/20261021051004_school_website_content_server_only.sql",
    import.meta.url,
  ),
  "utf8",
);
assert(
  fs
    .readFileSync(
      new URL("../../supabase/APPLY_ENROLLMENT_AND_PREMIUM.sql", import.meta.url),
      "utf8",
    )
    .includes(sql),
);
await db.exec(sql);
await db.exec(sql);
for (const role of ["anon", "authenticated"]) {
  await db.exec("SET ROLE " + role);
  const result = await db.query("SELECT domain FROM public.school_settings");
  assert.deepEqual(
    result.rows.map((x) => x.domain),
    ["academic"],
  );
  let rejected = false;
  try {
    await db.exec("INSERT INTO public.school_settings VALUES(4,'school_blog.outro','{}')");
  } catch {
    rejected = true;
  }
  assert(rejected, "direct insert must be refused");
  const update = await db.query(
    "UPDATE public.school_settings SET value='{}' WHERE domain='school_website' RETURNING id",
  );
  assert.equal(update.rows.length, 0);
  let forbidden = false;
  try {
    await db.query("SELECT public.school_web_storage_ready()");
  } catch {
    forbidden = true;
  }
  assert(forbidden, "readiness RPC must be service-only");
  await db.exec("RESET ROLE");
}
await db.exec("SET ROLE service_role");
assert.equal((await db.query("SELECT domain FROM public.school_settings")).rows.length, 3);
assert.equal(
  (await db.query("SELECT public.school_web_storage_ready() AS ready")).rows[0].ready,
  true,
);
await db.exec("UPDATE public.school_settings SET value='{}' WHERE domain='school_website'");
await db.exec("RESET ROLE");
await db.exec("DROP POLICY school_web_content_server_only ON public.school_settings");
await db.exec("SET ROLE service_role");
assert.equal(
  (await db.query("SELECT public.school_web_storage_ready() AS ready")).rows[0].ready,
  false,
);
console.log(
  JSON.stringify({
    idempotent: true,
    anonymousAndMemberReadBlocked: true,
    directWriteBlocked: true,
    serviceAccess: true,
    readinessGuard: true,
  }),
);
await db.close();
