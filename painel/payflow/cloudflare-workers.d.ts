/**
 * `cloudflare:workers` é um módulo nativo do workerd: existe em execução, não no
 * `node_modules`, por isso o TypeScript não o encontra. Declara-se só o que
 * `lib/cf-env.ts` usa — o objecto dos bindings. Os tipos de cada binding vêm do
 * lado de quem o lê (`drizzle(env.DB)`, `env.TRANSFER_PROOFS`).
 */
declare module "cloudflare:workers" {
  export const env: Record<string, unknown>;
}
