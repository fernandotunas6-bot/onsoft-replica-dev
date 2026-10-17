/**
 * Ambientes do SIGA Plus para quem administra (decisão do dono, 2026-10-15).
 *
 * Uma conta, vários ambientes: o administrador da escola entra no painel
 * administrativo e no portal escolar com o mesmo login. A Administração Global
 * (ADMIN) é outra aplicação e só abre a `platform_admins` — ser administrador
 * de uma escola nunca a concede.
 */

export type SchoolEnvironmentId = "admin" | "portal" | "setup";

export type SchoolEnvironment = {
  id: SchoolEnvironmentId;
  title: string;
  hint: string;
  path: string;
};

export const SCHOOL_ENVIRONMENTS: readonly SchoolEnvironment[] = [
  { id: "admin", title: "Painel Administrativo", hint: "Gestão da escola", path: "/" },
  { id: "portal", title: "Portal Escolar", hint: "Gestão académica", path: "/pedagogica" },
  {
    id: "setup",
    title: "Assistente de configuração",
    hint: "Preparar a instituição para começar a funcionar",
    path: "/configuracoes/inicio",
  },
];

/** Página «Onde deseja começar?» do administrador. */
export const ADMIN_WELCOME_PATH = "/configuracoes/boas-vindas";

/** Ambiente em que a página actual se encontra (para marcar no seletor). */
export function environmentForPath(pathname: string): SchoolEnvironmentId {
  if (pathname === "/configuracoes/inicio" || pathname === ADMIN_WELCOME_PATH) return "setup";
  if (
    pathname === "/pedagogica" ||
    pathname.startsWith("/pedagogica/") ||
    pathname.startsWith("/planos-aula") ||
    pathname.startsWith("/relatorios/academicos")
  ) {
    return "portal";
  }
  return "admin";
}
