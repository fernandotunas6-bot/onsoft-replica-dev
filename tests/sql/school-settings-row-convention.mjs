// school_settings: o código exige uma linha por (school_id, domain); a base não a garante.
//
// Lido da produção a 2026-10-21 (consulta só-leitura ao catálogo):
//
//   school_settings_school_id_domain_version_key  UNIQUE (school_id, domain, version)
//
// Ou seja, a base **aceita** várias versões do mesmo domínio. Mas nenhuma
// escrita em produção as usa: nos 55 registos, nenhum domínio tem mais linhas
// do que escolas, e o `version` sobe na própria linha (chega a 11 no
// print_templates). O convénio real é o do helper partilhado
// `updateSettingsDomainValue`: UPDATE da linha única, com `version` como trava
// optimista, e leitura por `readSettingsRow` com `.maybeSingle()`.
//
// Atenção: a migração do repositório
// (supabase/migrations/20260908120000_school_settings_versioned.sql) declara
// `UNIQUE (school_id, domain)` — diferente do que a base tem. O ficheiro e a
// base divergem; a base é que vale.
//
// O risco que este ensaio fixa: como a restrição não impede a segunda linha,
// quem desenhar histórico append-only neste domínio não falha a escrever —
// falha a ler, na primeira leitura seguinte, e em todos os consumidores do
// domínio ao mesmo tempo.
//
// Não usa credenciais, dados ou projectos Supabase.
import assert from "node:assert/strict";

const { PGlite } = await import(process.env["SIGA_SQL_TEST_MODULE_PATH"] || "@electric-sql/pglite");
const ESCOLA = "00000000-0000-0000-0000-00000000000a";

const db = new PGlite();
try {
  // A tabela como a produção a tem, incluindo a restrição real.
  await db.exec(`
    CREATE TABLE public.school_settings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      school_id uuid NOT NULL,
      domain text NOT NULL,
      value jsonb NOT NULL DEFAULT '{}'::jsonb,
      version integer NOT NULL DEFAULT 1 CHECK (version > 0),
      changed_by uuid,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT school_settings_school_id_domain_version_key UNIQUE (school_id, domain, version)
    );
  `);

  const publicar = (versao) =>
    db.exec(
      `INSERT INTO public.school_settings (school_id, domain, version, value)
       VALUES ('${ESCOLA}', 'school_website', ${versao}, '{"published":"v${versao}"}')`,
    );

  await publicar(1);
  // A restrição aceita a segunda linha: o modelo append-only não falha a escrever.
  await publicar(2);

  // E é aqui que parte. `readSettingsRow` faz `.maybeSingle()` sobre
  // (school_id, domain) — que tolera zero ou uma linha, não duas. A partir
  // daqui, qualquer leitura do domínio devolve erro, para todos os
  // consumidores, sem que nada tenha falhado na escrita.
  const { rows } = await db.query(
    `SELECT id FROM public.school_settings WHERE school_id = $1 AND domain = $2`,
    [ESCOLA, "school_website"],
  );
  assert.equal(
    rows.length,
    2,
    "a restrição da produção devia aceitar duas versões do mesmo domínio",
  );

  // O convénio que os dez domínios seguem: a mesma linha, com a versão a subir.
  await db.exec(`DELETE FROM public.school_settings WHERE version = 2`);
  await db.exec(
    `UPDATE public.school_settings SET value = '{"published":"v2"}', version = version + 1
     WHERE school_id = '${ESCOLA}' AND domain = 'school_website' AND version = 1`,
  );
  const unica = await db.query(
    `SELECT count(*)::int AS linhas, max(version) AS versao FROM public.school_settings
     WHERE school_id = $1 AND domain = $2`,
    [ESCOLA, "school_website"],
  );
  assert.equal(unica.rows[0].linhas, 1, "a actualização devia manter uma linha");
  assert.equal(Number(unica.rows[0].versao), 2, "a versão devia subir na própria linha");

  // A trava optimista: gravar sobre uma versão já ultrapassada não afecta nada.
  const tardia = await db.query(
    `UPDATE public.school_settings SET value = '{"published":"tarde"}'
     WHERE school_id = $1 AND domain = $2 AND version = 1 RETURNING id`,
    [ESCOLA, "school_website"],
  );
  assert.equal(tardia.rows.length, 0, "uma gravação sobre a versão antiga devia não apanhar nada");

  console.log(
    "school-settings-row-convention: a base aceita várias linhas, o código exige uma OK",
  );
} finally {
  await db.close();
}
