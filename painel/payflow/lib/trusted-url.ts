/** URL HTTPS (ou localhost em http) definida só no servidor — nunca a partir do pedido. */
export function resolveTrustedHttpsUrl(value: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const localHostname = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !(url.protocol === "http:" && localHostname)) return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}
