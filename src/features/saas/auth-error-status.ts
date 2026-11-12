/** Código HTTP de um erro de autorização das rotas `/api/saas/*`. */
export function authErrorStatus(message: string): number {
  if (message === "Unauthorized" || message.includes("Sem permissão")) return 401;
  if (message.includes("não encontrada")) return 404;
  return 500;
}
