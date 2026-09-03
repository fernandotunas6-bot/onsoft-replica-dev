/**
 * Abstração segura de ambiente entre Cloudflare Workers e Node.js / Next.js local.
 */
type RuntimeEnv = Record<string, any>;

export const env: RuntimeEnv =
  typeof (globalThis as any).env !== "undefined"
    ? (globalThis as any).env
    : typeof process !== "undefined"
    ? (process.env as RuntimeEnv)
    : {};
