/**
 * Development login shortcuts must remain impossible in a published runtime.
 * Keep this pure so the production guard is directly testable.
 */
export function isDevAuthBypassEnabled(environment: NodeJS.ProcessEnv = process.env): boolean {
  // Só em desenvolvimento local explícito. Recusar apenas `production` não chega:
  // um `NODE_ENV` ausente, `test` ou `staging` também não é desenvolvimento.
  if (environment.NODE_ENV !== "development") return false;
  // `VITE_AUTH_DISABLED` é uma variável de cliente e vai no bundle — não pode
  // ser o que decide abrir uma sessão de administrador no servidor.
  return environment.AUTH_BYPASS === "true";
}
