/**
 * Escola activa de um utilizador com várias escolas.
 *
 * A escolha viaja num cookie porque o browser o envia automaticamente em todos
 * os pedidos: o servidor resolve sempre a mesma escola que o interface mostra,
 * sem cada server function ter de a receber como argumento. O cookie é apenas
 * transporte — o servidor valida-o contra as memberships reais do utilizador,
 * por isso alterá-lo à mão não dá acesso a escola nenhuma.
 */

export const ACTIVE_SCHOOL_COOKIE = "siga-active-school";
export const ACTIVE_SCHOOL_STORAGE_KEY = "siga:active-school-id";

/** Sinal de que a escola guardada já não pertence ao utilizador (ex.: saiu da escola). */
export const ACTIVE_SCHOOL_UNAVAILABLE = "ACTIVE_SCHOOL_UNAVAILABLE";

/**
 * Evento do `window` quando o utilizador muda de escola (useCurrentAccount). O
 * TenantProvider ouve-o: no anfitrião sem escola (`app.`) o tenant vem da escola
 * da sessão e tem de ser relido.
 */
export const ACTIVE_SCHOOL_CHANGED_EVENT = "siga:active-school-changed";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function isActiveSchoolUnavailable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.includes(ACTIVE_SCHOOL_UNAVAILABLE);
}

/** Grava a escolha em cookie (para o servidor) e em localStorage (para o arranque). */
export function rememberActiveSchool(schoolId: string | null) {
  if (typeof document === "undefined") return;

  if (schoolId) {
    document.cookie = `${ACTIVE_SCHOOL_COOKIE}=${encodeURIComponent(schoolId)}; path=/; max-age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
    localStorage.setItem(ACTIVE_SCHOOL_STORAGE_KEY, schoolId);
    return;
  }

  document.cookie = `${ACTIVE_SCHOOL_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
  localStorage.removeItem(ACTIVE_SCHOOL_STORAGE_KEY);
}

export function readStoredActiveSchool(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACTIVE_SCHOOL_STORAGE_KEY);
}
