import { createIsomorphicFn } from "@tanstack/react-start";

/**
 * Pista (não sensível) de que este browser tem uma sessão iniciada.
 *
 * A sessão do Supabase vive no `localStorage`, que o servidor não vê: sem pista, o
 * SSR mandava sempre "A verificar sessão…" e o ecrã de entrada só aparecia depois
 * de todo o JS da rota descarregar e hidratar (LCP ~2 s no Lighthouse). Com a pista,
 * quem não tem sessão recebe o ecrã de entrada já no HTML.
 *
 * NÃO é autenticação: o cookie só escolhe o que o SSR desenha. Quem o falsificar vê
 * o ecrã de carregamento em vez do de entrada, e nada mais. `AuthGate` mantém-no em
 * dia a cada mudança de sessão.
 */
export const SESSION_HINT_COOKIE = "siga-session-hint";

/** O valor do cookie diz se há sessão ("1"); ausente ou "0" = sem sessão. */
export function hasSessionHint(cookieValue: string | null | undefined) {
  return cookieValue === "1";
}

export function readSessionHintFromCookieHeader(cookieHeader: string) {
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_HINT_COOKIE}=([^;]*)`));
  return hasSessionHint(match?.[1]);
}

/** Lê a pista no servidor (pedido SSR) ou no browser (navegação no cliente). */
export const readSessionHint = createIsomorphicFn()
  .server(async () => {
    const { readSessionHintCookie } = await import("@/features/auth/session-hint.server");
    return hasSessionHint(await readSessionHintCookie());
  })
  .client(async () => readSessionHintFromCookieHeader(document.cookie));

/** Grava a pista no browser. Um ano; `SameSite=Lax`; sem dados da sessão. */
export function writeSessionHint(hasSession: boolean) {
  if (typeof document === "undefined") return;
  const present = document.cookie.includes(`${SESSION_HINT_COOKIE}=`);
  if (present && readSessionHintFromCookieHeader(document.cookie) === hasSession) return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${SESSION_HINT_COOKIE}=${hasSession ? "1" : "0"}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
}
