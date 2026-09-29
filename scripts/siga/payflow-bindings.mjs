/**
 * Ligações de produção do PayFlow (Cloudflare Worker `siga-plus-payflow`).
 *
 * O build do vinext gera `dist/server/wrangler.json` com a base D1 de
 * desenvolvimento (id `00000000-…`). Até 29/09 o `deploy-all.mjs` apagava as
 * ligações D1 e R2 antes de publicar, e o PayFlow corria em produção sem base:
 * cada `getDb()` falhava com "binding `DB` is unavailable".
 *
 * - D1 `siga-payflow` (obrigatória). O id não é segredo; pode ser trocado por
 *   `PAYFLOW_D1_DATABASE_ID`. `migrations_dir` aponta para `painel/payflow/drizzle`,
 *   e o `wrangler d1 migrations apply` regista cada ficheiro em `d1_migrations`.
 * - R2 dos comprovativos (opcional). Só entra com `PAYFLOW_R2_BUCKET`, porque o
 *   R2 ainda não está activo na conta. Sem ele, o envio de comprovativos responde
 *   `transfer_proof_storage_unavailable` e o resto funciona.
 */

export const PAYFLOW_D1_DATABASE_NAME = "siga-payflow";
export const PAYFLOW_D1_DATABASE_ID = "bbfa8e07-48ad-4397-902b-bcb0b8da2948";
export const PAYFLOW_D1_BINDING = "DB";
export const PAYFLOW_R2_BINDING = "TRANSFER_PROOFS";

/** Id que o build usa em desenvolvimento; nunca pode chegar a produção. */
export const PLACEHOLDER_D1_DATABASE_ID = "00000000-0000-4000-8000-000000000000";

/**
 * @param {Record<string, unknown>} cfg conteúdo de `dist/server/wrangler.json`
 * @param {{ migrationsDir: string, env?: Record<string, string | undefined> }} options
 */
export function applyPayflowProductionBindings(cfg, { migrationsDir, env = process.env }) {
  const databaseId = env.PAYFLOW_D1_DATABASE_ID?.trim() || PAYFLOW_D1_DATABASE_ID;
  if (databaseId === PLACEHOLDER_D1_DATABASE_ID) {
    throw new Error("PayFlow: o id da base D1 é o de desenvolvimento, não o de produção.");
  }
  const bucket = env.PAYFLOW_R2_BUCKET?.trim();

  return {
    ...cfg,
    d1_databases: [
      {
        binding: PAYFLOW_D1_BINDING,
        database_name: PAYFLOW_D1_DATABASE_NAME,
        database_id: databaseId,
        migrations_dir: migrationsDir,
      },
    ],
    r2_buckets: bucket ? [{ binding: PAYFLOW_R2_BINDING, bucket_name: bucket }] : [],
  };
}
