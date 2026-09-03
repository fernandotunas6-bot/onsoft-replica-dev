// Shim for cloudflare:workers in local dev / Next.js environment
export const env: Record<string, any> = typeof process !== "undefined" ? process.env : {};
export default { env };
