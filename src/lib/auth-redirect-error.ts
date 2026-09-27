/**
 * Erro devolvido pelo Supabase Auth no regresso de um início de sessão externo
 * (Google), em `?error=…&error_description=…` ou no fragmento `#error=…`.
 *
 * Sem isto, a pessoa voltava ao formulário de entrada sem aviso nenhum — foi o
 * que aconteceu a 2026-09-26, quando o segredo do cliente Google estava errado
 * no painel do Supabase («Unable to exchange external code»).
 *
 * O texto do fornecedor não é mostrado: pode trazer detalhes internos. Só se
 * distingue o cancelamento pela própria pessoa.
 */

export type AuthRedirectError = { message: string; code: string };

export function authRedirectError(search: string, hash: string): AuthRedirectError | null {
  const query = new URLSearchParams(search);
  const fragment = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const error = query.get("error") ?? fragment.get("error");
  const description = query.get("error_description") ?? fragment.get("error_description");
  // Só o formato do Supabase Auth: `error` com `error_description`.
  if (!error || !description) return null;
  const code = query.get("error_code") ?? fragment.get("error_code") ?? error;
  if (error === "access_denied" || /cancel|denied/i.test(description)) {
    return { code, message: "O início de sessão foi cancelado. Pode tentar outra vez." };
  }
  return {
    code,
    message:
      "Não foi possível entrar com a conta externa. Tente novamente ou entre com e-mail e senha; se persistir, avise a administração da escola.",
  };
}

/** Parâmetros de erro do Supabase Auth, a retirar do URL depois de mostrados. */
export const AUTH_REDIRECT_ERROR_PARAMS = ["error", "error_code", "error_description"];

/** O URL sem os parâmetros de erro (query e fragmento). */
export function withoutAuthRedirectError(href: string): string {
  const url = new URL(href);
  for (const key of AUTH_REDIRECT_ERROR_PARAMS) url.searchParams.delete(key);
  if (url.hash) {
    const fragment = new URLSearchParams(url.hash.slice(1));
    const had = AUTH_REDIRECT_ERROR_PARAMS.some((key) => fragment.has(key));
    if (had) {
      for (const key of AUTH_REDIRECT_ERROR_PARAMS) fragment.delete(key);
      const rest = fragment.toString();
      url.hash = rest ? `#${rest}` : "";
    }
  }
  return url.pathname + url.search + url.hash;
}
