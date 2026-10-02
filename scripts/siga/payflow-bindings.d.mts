/**
 * Declarações para `payflow-bindings.mjs` — JavaScript puro (usado pelo
 * `deploy-all.mjs`), importado a partir de TypeScript em
 * `tests/saas/payflow-bindings.test.ts`.
 */
export const PAYFLOW_D1_DATABASE_NAME: string;
export const PAYFLOW_D1_DATABASE_ID: string;
export const PAYFLOW_D1_BINDING: string;
export const PAYFLOW_R2_BINDING: string;
export const PLACEHOLDER_D1_DATABASE_ID: string;

export type PayflowD1Binding = {
  binding: string;
  database_name: string;
  database_id: string;
  migrations_dir: string;
};

export function applyPayflowProductionBindings<T extends Record<string, unknown>>(
  cfg: T,
  options: { migrationsDir: string; env?: Record<string, string | undefined> },
): T & {
  d1_databases: PayflowD1Binding[];
  r2_buckets: Array<{ binding: string; bucket_name: string }>;
};
