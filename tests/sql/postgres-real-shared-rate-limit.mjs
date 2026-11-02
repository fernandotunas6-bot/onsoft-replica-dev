/**
 * PostgreSQL real, isolado no GitHub Actions, sem Supabase nem dados reais.
 * Verifica concorrência da função SQL efectiva que limita tentativas.
 *
 * Segurança: recusa ligações fora do Postgres efémero local e de sua BD fixture.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import postgres from "postgres";

const connectionString = process.env.SIGA_SECURITY_PG_TEST_URL;
if (!connectionString) throw new Error("Falta SIGA_SECURITY_PG_TEST_URL (fixture local).");

const parsed = new URL(connectionString);
if (
  !["127.0.0.1", "localhost"].includes(parsed.hostname) ||
  parsed.pathname !== "/siga_security_ci" ||
  parsed.username !== "postgres" ||
  !parsed.password
) {
  throw new Error("Segurança: só é permitida a base local siga_security_ci.");
}

const sql = postgres(connectionString, {
  max: 16,
  connect_timeout: 10,
  idle_timeout: 5,
  prepare: false,
});

const key = (value) => createHash("sha256").update(value).digest("hex");
const migration = readFileSync(
  new URL("../../supabase/migrations/20260927170000_shared_rate_limit.sql", import.meta.url),
  "utf8",
);

async function consume(keys, windowSeconds = 60, maxHits = 3) {
  const hashes = keys.map(key);
  const [result] = await sql`
    SELECT public.siga_rate_limit_consume(
      ${sql.array(hashes)}::text[],
      ${windowSeconds}::integer,
      ${maxHits}::integer
    ) AS allowed
  `;
  return result.allowed;
}

async function asRole(role, fn) {
  // Papel fixo, não interpolado a partir de input de cliente.
  assert.ok(["anon", "authenticated", "service_role"].includes(role));
  return sql.begin(async (tx) => {
    await tx.unsafe(`SET LOCAL ROLE ${role}`);
    return fn(tx);
  });
}

try {
  await sql.unsafe(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN;
  `);

  // Migração REAL, sem alterar a migração histórica nem o Supabase.
  await sql.unsafe(migration);

  const permissions = await sql`
    SELECT grantee, privilege_type
    FROM information_schema.role_routine_grants
    WHERE specific_schema = 'public'
      AND routine_name = 'siga_rate_limit_consume'
      AND grantee IN ('anon', 'authenticated', 'service_role')
  `;
  assert.deepEqual(
    permissions.map((x) => x.grantee).sort(),
    ["service_role"],
    "apenas service_role deve executar a função",
  );

  for (const role of ["anon", "authenticated"]) {
    await assert.rejects(
      asRole(
        role,
        (tx) => tx`
          SELECT public.siga_rate_limit_consume(
            ARRAY[${key("forbidden")}]::text[], 60, 3
          )
        `,
      ),
      /permission denied/i,
      `RPC acessível indevidamente a ${role}`,
    );
  }

  await assert.rejects(
    asRole("service_role", (tx) => tx`SELECT count(*) FROM public.siga_rate_limit_hits`),
    /permission denied/i,
    "service_role não deve ler directamente a tabela",
  );

  // Pedidos simultâneos chegam de ligações distintas. O advisory xact lock
  // deve permitir só os três primeiros, independentemente da ordem.
  const attempts = await Promise.all(
    Array.from({ length: 12 }, () => consume(["concurrent:account-A"], 60, 3)),
  );
  assert.equal(attempts.filter(Boolean).length, 3);
  assert.equal(attempts.filter((value) => value === false).length, 9);

  const [hits] = await sql`
    SELECT count(*)::integer AS n
    FROM public.siga_rate_limit_hits
    WHERE key_hash = ${key("concurrent:account-A")}
  `;
  assert.equal(hits.n, 3, "o limite partilhado não pode duplicar gravações");

  // Se uma chave já esgotou a janela, nenhuma outra chave do mesmo pedido
  // deve ser debitada (consumo atómico da tentativa por escola/conta).
  assert.equal(await consume(["concurrent:account-A", "fresh:account-B"]), false);
  const [other] = await sql`
    SELECT count(*)::integer AS n
    FROM public.siga_rate_limit_hits
    WHERE key_hash = ${key("fresh:account-B")}
  `;
  assert.equal(other.n, 0);

  // Uma chave duplicada num pedido representa apenas uma tentativa.
  assert.equal(await consume(["duplicate:account-C", "duplicate:account-C"]), true);
  const [duplicates] = await sql`
    SELECT count(*)::integer AS n
    FROM public.siga_rate_limit_hits
    WHERE key_hash = ${key("duplicate:account-C")}
  `;
  assert.equal(duplicates.n, 1);

  // A API no servidor rejeita configuração inválida. A função histórica
  // ainda tem um retorno permissivo para max_hits < 1: corrigir em migração
  // versionada só após staging, sem esconder o risco neste ensaio.
  console.log("postgres-real-shared-rate-limit: concorrência, atomicidade, RBAC e RLS aprovados");
} finally {
  await sql.end({ timeout: 5 });
}
