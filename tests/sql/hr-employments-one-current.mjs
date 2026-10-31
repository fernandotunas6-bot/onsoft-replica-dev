// Ensaio isolado do vínculo RH em curso: sem dados nem credenciais de produção.
// node tests/sql/hr-employments-one-current.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const { PGlite } = await import(process.env["SIGA_SQL_TEST_MODULE_PATH"] || "@electric-sql/pglite");

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20261030000000_hr_employments_one_current_per_person.sql",
    import.meta.url,
  ),
  "utf8",
);
const ids = {
  a: "11111111-1111-4111-8111-111111111111",
  b: "22222222-2222-4222-8222-222222222222",
  personA: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  personB: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
};
// DDL de 20260906124500_hr_payroll_foundation.sql; FKs fora do cenário omitidas.
const schema = `
  CREATE TABLE public.hr_employments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id uuid NOT NULL,
    person_id uuid NOT NULL,
    employment_type text NOT NULL DEFAULT 'other',
    status text NOT NULL DEFAULT 'active' CHECK (status IN (
      'draft', 'active', 'suspended', 'terminated', 'expired'
    )),
    hire_date date NOT NULL DEFAULT current_date,
    created_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
  );
`;
const insert = (school, person, status = "draft", deleted = "null") => `
  INSERT INTO public.hr_employments (school_id, person_id, status, deleted_at)
  VALUES ('${school}', '${person}', '${status}', ${deleted});
`;

// 1. Tabela ausente: a migração não falha nem cria nada.
{
  const db = new PGlite();
  try {
    await db.exec(migration);
    await db.exec(migration);
  } finally {
    await db.close();
  }
}

// 2. Duplicados já existentes: pára sem alterar dados.
{
  const db = new PGlite();
  try {
    await db.exec(schema);
    await db.exec(insert(ids.a, ids.personA, "draft"));
    await db.exec(insert(ids.a, ids.personA, "active"));
    await assert.rejects(db.exec(migration), /1 pessoa\(s\) com mais de um vínculo em curso/);
    const { rows } = await db.query("SELECT count(*)::int AS n FROM public.hr_employments");
    assert.equal(rows[0].n, 2, "não apagar nem fundir vínculos");
    const { rows: index } = await db.query(
      "SELECT to_regclass('public.hr_employments_one_current_per_person_idx') AS idx",
    );
    assert.equal(index[0].idx, null);
  } finally {
    await db.close();
  }
}

// 3. Sem duplicados: cria o índice, é idempotente e aplica a regra.
{
  const db = new PGlite();
  try {
    await db.exec(schema);
    await db.exec(insert(ids.a, ids.personA, "terminated"));
    await db.exec(insert(ids.a, ids.personA, "active"));
    await db.exec(insert(ids.a, ids.personA, "draft", "now()"));
    await db.exec(migration);
    await db.exec(migration);

    await assert.rejects(db.exec(insert(ids.a, ids.personA, "draft")), /duplicate key/);
    await assert.rejects(db.exec(insert(ids.a, ids.personA, "suspended")), /duplicate key/);
    // Histórico e ficha eliminada não contam; outra escola e outra pessoa são independentes.
    await db.exec(insert(ids.a, ids.personA, "expired"));
    await db.exec(insert(ids.a, ids.personA, "draft", "now()"));
    await db.exec(insert(ids.b, ids.personA, "draft"));
    await db.exec(insert(ids.a, ids.personB, "draft"));
    // Cessar o vínculo actual permite um novo.
    await db.exec(
      `UPDATE public.hr_employments SET status = 'terminated'
        WHERE school_id = '${ids.a}' AND person_id = '${ids.personA}' AND status = 'active'`,
    );
    await db.exec(insert(ids.a, ids.personA, "draft"));
  } finally {
    await db.close();
  }
}

console.log("hr-employments-one-current: duplicados, histórico, escolas e idempotência OK");
