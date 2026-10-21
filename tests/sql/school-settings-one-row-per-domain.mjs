// A tabela school_settings guarda UMA linha por (school_id, domain).
//
// A migração que a cria — supabase/migrations/20260908120000_school_settings_versioned.sql
// — declara `UNIQUE (school_id, domain)`, e o helper partilhado
// `updateSettingsDomainValue` faz UPDATE dessa linha usando `version` como
// trava optimista. O comentário da própria migração diz o contrário («guarda
// versões», «uma linha nunca é editada»), e é daí que nasce a confusão: quem
// ler o comentário desenha histórico append-only e descobre tarde que a
// restrição o proíbe.
//
// Este ensaio fixa o que a restrição faz, em PostgreSQL a sério: a segunda
// publicação da mesma escola no mesmo domínio é recusada. Dez domínios e doze
// chamadas ao helper dependem disto; se algum dia a restrição mudar, é aqui que
// se vê primeiro.
//
// Não usa credenciais, dados ou projectos Supabase.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { PGlite } = await import(process.env["SIGA_SQL_TEST_MODULE_PATH"] || "@electric-sql/pglite");
const ESCOLA = "00000000-0000-0000-0000-00000000000a";

const migracao = readFileSync(
  new URL(
    "../../supabase/migrations/20260908120000_school_settings_versioned.sql",
    import.meta.url,
  ),
  "utf8",
);
const criacao = migracao.slice(
  migracao.indexOf("CREATE TABLE IF NOT EXISTS public.school_settings"),
  migracao.indexOf(");", migracao.indexOf("CREATE TABLE IF NOT EXISTS public.school_settings")) + 2,
);
assert.match(criacao, /UNIQUE \(school_id, domain\)/, "a migração deixou de declarar a restrição");

const db = new PGlite();
try {
  // Sem as dependências do esquema real: só a tabela, para isolar a restrição.
  await db.exec(criacao.replace(/REFERENCES[^,\n]*/g, "").replace(/\bauth\.users\(id\)/g, ""));

  const publicar = (versao) =>
    db.exec(
      `INSERT INTO public.school_settings (school_id, domain, version, value)
       VALUES ('${ESCOLA}', 'school_website', ${versao}, '{"published":"v${versao}"}')`,
    );

  await publicar(1);

  await assert.rejects(
    () => publicar(2),
    /duplicate key value violates unique constraint/,
    "uma segunda linha no mesmo domínio passou — a restrição mudou",
  );

  // O caminho que a tabela suporta: a mesma linha, com a versão a subir.
  await db.exec(
    `UPDATE public.school_settings SET value = '{"published":"v2"}', version = version + 1
     WHERE school_id = '${ESCOLA}' AND domain = 'school_website' AND version = 1`,
  );
  const { rows } = await db.query(
    `SELECT count(*)::int AS linhas, max(version) AS versao FROM public.school_settings`,
  );
  assert.equal(rows[0].linhas, 1, "a actualização devia manter uma linha");
  assert.equal(Number(rows[0].versao), 2, "a versão devia subir na própria linha");

  // Domínios diferentes coexistem: a restrição é por (escola, domínio).
  await db.exec(
    `INSERT INTO public.school_settings (school_id, domain, version, value)
     VALUES ('${ESCOLA}', 'billing', 1, '{}')`,
  );

  console.log("school-settings-one-row-per-domain: UNIQUE (school_id, domain) confirmado OK");
} finally {
  await db.close();
}
