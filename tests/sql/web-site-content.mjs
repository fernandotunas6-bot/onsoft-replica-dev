// Ensaio local (PGlite) de 20261007100000_web_site_content.sql. Sem produção.
// Executar: SIGA_SQL_TEST_MODULE_PATH=<.../pglite/dist/index.js> node tests/sql/web-site-content.mjs
const { PGlite } = await import(process.env["SIGA_SQL_TEST_MODULE_PATH"] || "@electric-sql/pglite");
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const db = new PGlite();
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE TABLE public.schools(id uuid PRIMARY KEY, name text);
CREATE FUNCTION public.siga_touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now() + interval '1 second'; RETURN NEW; END $$;
`);
const migration = readFileSync(
  new URL("../../supabase/migrations/20261007100000_web_site_content.sql", import.meta.url),
  "utf8",
);
await db.exec(migration);
await db.exec(migration); // idempotente

const count = async (sql) => Number((await db.query(sql)).rows[0].n);

// As perguntas do site entram uma vez (a segunda passagem não duplica).
const faqs = await count("SELECT count(*) AS n FROM public.web_faqs");
assert.equal(faqs, 20);
assert.equal(await count("SELECT count(*) AS n FROM public.web_faqs WHERE featured"), 6);
await db.exec("DELETE FROM public.web_faqs WHERE category = 'Conta'");
await db.exec(migration);
assert.equal(
  await count("SELECT count(*) AS n FROM public.web_faqs"),
  faqs - 3,
  "o ADMIN apagou perguntas: correr outra vez não as repõe",
);

// Nenhuma tabela é acessível a anon/authenticated.
for (const table of ["web_blog_posts", "web_faqs", "web_contact_messages", "web_school_showcase"]) {
  for (const role of ["anon", "authenticated"]) {
    const { rows } = await db.query(
      `SELECT has_table_privilege('${role}', 'public.${table}', 'SELECT') AS s,
              has_table_privilege('${role}', 'public.${table}', 'INSERT') AS i`,
    );
    assert.deepEqual(rows[0], { s: false, i: false }, `${role} não pode tocar em ${table}`);
  }
  const { rows } = await db.query(
    `SELECT relrowsecurity AS rls, relforcerowsecurity AS forced FROM pg_class WHERE relname = '${table}'`,
  );
  assert.deepEqual(rows[0], { rls: true, forced: true }, `${table} com FORCE RLS`);
}

// Artigo publicado precisa de data; slug só minúsculas e hífens.
await assert.rejects(
  db.exec(
    "INSERT INTO public.web_blog_posts (slug, title, status) VALUES ('a-b', 'Título', 'published')",
  ),
);
await assert.rejects(
  db.exec("INSERT INTO public.web_blog_posts (slug, title) VALUES ('Com Espaço', 'Título')"),
);
await db.exec(
  "INSERT INTO public.web_blog_posts (slug, title, status, published_at) VALUES ('novo-ano', 'Novo ano lectivo', 'published', now())",
);

// Contacto: e-mail normalizado e mensagem mínima.
await assert.rejects(
  db.exec(
    "INSERT INTO public.web_contact_messages (name, email, subject, message) VALUES ('Ana', 'Ana@X.ao', 'Assunto', 'Mensagem longa')",
  ),
);
await db.exec(
  "INSERT INTO public.web_contact_messages (name, email, subject, message) VALUES ('Ana', 'ana@x.ao', 'Assunto', 'Mensagem longa')",
);

// Vitrine: apagar a escola apaga a escolha; por defeito a escola não aparece.
const S = "00000000-0000-0000-0000-00000000000a";
await db.exec(`INSERT INTO public.schools VALUES ('${S}', 'Escola')`);
await db.exec(`INSERT INTO public.web_school_showcase (school_id) VALUES ('${S}')`);
assert.equal(await count("SELECT count(*) AS n FROM public.web_school_showcase WHERE opted_in"), 0);
await db.exec(`DELETE FROM public.schools WHERE id = '${S}'`);
assert.equal(await count("SELECT count(*) AS n FROM public.web_school_showcase"), 0);

console.log("web-site-content: ok");
