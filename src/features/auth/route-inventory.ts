/**
 * Prefixos de rotas de UI do SIGA — auditar em conjunto com `access-policy.ts`
 * e `scripts/siga/modules.json`. Actualizar ao adicionar `src/routes/*.tsx`.
 */
export const SIGA_AUTHENTICATED_ROUTE_PREFIXES = [
  "/",
  "/alunos",
  "/pessoas",
  "/professores",
  "/pedagogica",
  "/relatorios/academicos",
  "/relatorios/financeiros",
  "/financeiro",
  "/faturas",
  "/documentos",
  "/calendario",
  "/comunicacoes",
  "/acessos",
  "/configuracoes",
  "/arquivos",
  "/planos-aula",
  "/importar",
  "/catracas",
  "/perfil",
] as const;

/** Rotas públicas ou semi-públicas (sem RBAC de módulo escolar). */
export const SIGA_PUBLIC_ROUTE_PREFIXES = ["/matricula", "/calendario/ics", "/criar-escola", "/convite", "/auth"] as const;

/** Rotas sempre permitidas com sessão ou utilitários (API, pontes SaaS). */
export const SIGA_BYPASS_ROUTE_PREFIXES = ["/alterar-senha", "/saas-admin", "/api/"] as const;

export type SigaRoutePrefix =
  | (typeof SIGA_AUTHENTICATED_ROUTE_PREFIXES)[number]
  | (typeof SIGA_PUBLIC_ROUTE_PREFIXES)[number]
  | (typeof SIGA_BYPASS_ROUTE_PREFIXES)[number];

/** Verifica se um pathname pertence ao inventário conhecido de rotas SIGA. */
export function isKnownSigaRoute(pathname: string): boolean {
  const all = [
    ...SIGA_AUTHENTICATED_ROUTE_PREFIXES,
    ...SIGA_PUBLIC_ROUTE_PREFIXES,
    ...SIGA_BYPASS_ROUTE_PREFIXES,
  ];
  return all.some(
    (prefix) =>
      prefix === "/api/"
        ? pathname.startsWith(prefix)
        : pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
