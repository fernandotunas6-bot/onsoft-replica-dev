import { isPlatformRoute } from "./feature-flags";

export const DEFAULT_ADMIN_PATH = "/tenants";

/**
 * Destino depois do login (`?next=`): só caminhos internos da consola, nunca outro
 * domínio (`//evil`, `https://…`, `/\evil`). Usa a mesma lista de rotas protegidas do
 * portão (`PLATFORM_ROUTE_PREFIXES`): uma cópia à parte no formulário de login já
 * tinha divergido e mandava quem vinha de /dashboard-2 para /tenants.
 */
export function safeAdminNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return DEFAULT_ADMIN_PATH;
  }
  const pathname = next.split(/[?#]/)[0] ?? next;
  return isPlatformRoute(pathname) ? next : DEFAULT_ADMIN_PATH;
}
