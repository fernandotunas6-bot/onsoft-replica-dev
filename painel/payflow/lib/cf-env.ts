/**
 * Abstração segura de ambiente entre Cloudflare Workers e Node.js / Next.js local.
 */
type RuntimeEnv = Record<string, unknown>;

export const env: RuntimeEnv =
  typeof (globalThis as unknown as { env?: RuntimeEnv }).env !== "undefined"
    ? ((globalThis as unknown as { env: RuntimeEnv }).env)
    : typeof process !== "undefined"
      ? (process.env as RuntimeEnv)
      : {};
