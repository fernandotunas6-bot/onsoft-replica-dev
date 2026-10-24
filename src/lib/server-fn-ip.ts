import { getRequest, getRequestIP } from "@tanstack/react-start/server";

/**
 * IP de quem chama uma server function, para os limites de tentativas.
 *
 * `getRequestIP({ xForwardedFor: true })` lê o primeiro valor de `X-Forwarded-For`, que
 * vem do cliente: a Cloudflare acrescenta o IP verdadeiro ao fim do cabeçalho e mantém
 * o que o cliente lá pôs. Mudando-o a cada pedido, os limites por IP (OTP, entrar,
 * repor a senha, verificar documentos) não contavam nada. `CF-Connecting-IP` é posto
 * pela Cloudflare e não se falsifica; fora da Cloudflare (desenvolvimento) fica o resto.
 */
export function serverFnClientIp(): string {
  try {
    const fromCloudflare = getRequest()?.headers.get("cf-connecting-ip")?.trim();
    if (fromCloudflare) return fromCloudflare;
  } catch {
    // Fora de um pedido (testes): segue para o resto.
  }
  try {
    return getRequestIP({ xForwardedFor: true }) ?? "unknown";
  } catch {
    return "unknown";
  }
}
