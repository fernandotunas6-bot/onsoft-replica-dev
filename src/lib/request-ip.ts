/**
 * IP de rede usado exclusivamente para limitar tentativas (nunca para
 * autenticar ou autorizar um utilizador). O Worker de produção recebe
 * CF-Connecting-IP da borda da Cloudflare.
 *
 * X-Real-IP e X-Forwarded-For podem ser controlados pelo cliente. Só os
 * consideramos em desenvolvimento/testes, para conservar os ambientes locais.
 * Fora desses ambientes, se faltar CF-Connecting-IP válido, devolvemos a chave
 * partilhada "unknown" em vez de aceitar identificadores falsificados.
 *
 * Requisito operacional: impedir tráfego directo ao origin e validar
 * subrequests de outros Workers na Cloudflare. Um cabeçalho HTTP, por si só,
 * não prova a origem do pedido (ver docs/agents/HANDOFF_SECURITY_2026-11-02.md).
 */

/** Endereço IP isolado, sem portas, listas, zonas IPv6 ou outros metadados. */
export function validClientIp(value: string | null | undefined): string | null {
  if (!value || value.length > 45 || value !== value.trim()) return null;

  if (value.includes(":")) {
    // A URL valida a gramática de IPv6, incluindo IPv4-mapped IPv6.
    if (!/^[0-9a-fA-F:.]+$/.test(value)) return null;
    try {
      const normalized = new URL(`http://[${value}]/`).hostname;
      return normalized.startsWith("[") && normalized.endsWith("]")
        ? normalized.slice(1, -1)
        : null;
    } catch {
      return null;
    }
  }

  const parts = value.split(".");
  if (parts.length !== 4) return null;
  if (!parts.every((part) => /^(0|[1-9][0-9]{0,2})$/.test(part) && Number(part) <= 255)) {
    return null;
  }
  return parts.join(".");
}

function allowUntrustedForwardedIp(): boolean {
  return (
    typeof process !== "undefined" &&
    (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test")
  );
}

/**
 * Retorna um único IP validado. Não aceita XFF como fonte em produção, mesmo
 * quando CF-Connecting-IP está vazio ou malformado.
 */
export function clientIpFromRequest(request: Request): string {
  const cloudflare = validClientIp(request.headers.get("cf-connecting-ip"));
  if (cloudflare) return cloudflare;

  if (allowUntrustedForwardedIp()) {
    return (
      validClientIp(request.headers.get("x-real-ip")) ??
      validClientIp(request.headers.get("x-forwarded-for")?.split(",")[0]) ??
      "unknown"
    );
  }

  return "unknown";
}
