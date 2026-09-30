import { SESSION_HINT_COOKIE } from "@/features/auth/session-hint";

/**
 * Leitura do cookie-pista da sessão no SSR. Em `.server.ts` pela mesma razão que
 * `active-school-cookie.server.ts`: `@tanstack/react-start/server` não pode aparecer
 * no grafo do browser.
 */
export async function readSessionHintCookie(): Promise<string | null> {
  try {
    const { getCookie } = await import("@tanstack/react-start/server");
    return getCookie(SESSION_HINT_COOKIE) || null;
  } catch {
    return null;
  }
}
