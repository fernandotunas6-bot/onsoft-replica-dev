import { ACTIVE_SCHOOL_COOKIE } from "@/features/auth/active-school";

/**
 * Leitura do cookie da escola activa.
 *
 * Vive num ficheiro `.server.ts` de propósito: `@tanstack/react-start/server`
 * está na lista negra de especificadores do ambiente de cliente do plugin de
 * import-protection, e basta aparecer num módulo alcançável a partir do grafo
 * do browser para a app inteira falhar a compilar. Isolado aqui, o
 * especificador nunca é resolvido no ambiente de cliente.
 */
export async function readActiveSchoolCookie(): Promise<string | null> {
  try {
    const { getCookie } = await import("@tanstack/react-start/server");
    return getCookie(ACTIVE_SCHOOL_COOKIE) || null;
  } catch {
    return null;
  }
}
