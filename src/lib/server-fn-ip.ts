import { getRequest } from "@tanstack/react-start/server";
import { clientIpFromRequest } from "./request-ip";

/**
 * Usa a mesma política para as server functions e rotas HTTP: confiar no
 * CF-Connecting-IP fornecido pela Cloudflare, nunca no primeiro elemento de
 * X-Forwarded-For em produção. IP só serve para limitar tentativas, não para
 * substituir as verificações de sessão, MFA, RBAC e escola activa.
 */
export function serverFnClientIp(): string {
  try {
    const request = getRequest();
    return request ? clientIpFromRequest(request) : "unknown";
  } catch {
    return "unknown";
  }
}
