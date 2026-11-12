import type { QueryClient, QueryKey } from "@tanstack/react-query";

/**
 * Cache local mínima enquanto não existir SQLite cifrado com chave por actor.
 *
 * Não persistir objectos de configuração escolar (IBAN, NIF, preferências e dados
 * fiscais), calendário (descrições privadas) ou salas/turmas no localStorage.
 * Só os metadados escolares de ANO e PERÍODO aprovados abaixo são guardados.
 * Registos offline cifrados de presenças/notas continuam no cofre Stronghold.
 */
export const OFFLINE_QUERY_PREFIXES: readonly QueryKey[] = [
  ["school", "academic-years"],
  ["school", "academic-terms"],
];

const STORAGE_PREFIX = "siga:offline-queries:v2";
const LEGACY_STORAGE_PREFIX = "siga:offline-queries:v1";
const CACHE_VERSION = 2;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_BYTES = 32 * 1024;

type AcademicYear = {
  id: string;
  code: string;
  name: string;
  status: string;
};

type AcademicTerm = {
  id: string;
  name: string;
  sequence: number;
  starts_on: string;
  ends_on: string;
  academic_year_id: string;
};

type OfflineCache = {
  version: 2;
  savedAt: number;
  years?: AcademicYear[];
  terms?: AcademicTerm[];
};

function isBoundedString(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function cleanAcademicYears(value: unknown, schoolId?: string): AcademicYear[] | null {
  if (!Array.isArray(value) || value.length > 300) return null;
  const result: AcademicYear[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const data = item as Record<string, unknown>;
    if (schoolId && data.school_id !== schoolId) return null;
    if (
      !isBoundedString(data.id, 64) ||
      !isBoundedString(data.code, 120) ||
      !isBoundedString(data.name, 120) ||
      !isBoundedString(data.status, 40)
    ) {
      return null;
    }
    result.push({
      id: data.id,
      code: data.code,
      name: data.name,
      status: data.status,
    });
  }
  return result;
}

function cleanAcademicTerms(value: unknown, schoolId?: string): AcademicTerm[] | null {
  if (!Array.isArray(value) || value.length > 1000) return null;
  const result: AcademicTerm[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const data = item as Record<string, unknown>;
    if (schoolId && data.school_id !== schoolId) return null;
    if (
      !isBoundedString(data.id, 64) ||
      !isBoundedString(data.academic_year_id, 64) ||
      !isBoundedString(data.name, 120) ||
      !isBoundedString(data.starts_on, 40) ||
      !isBoundedString(data.ends_on, 40) ||
      typeof data.sequence !== "number" ||
      !Number.isInteger(data.sequence) ||
      data.sequence < 0 ||
      data.sequence > 50
    ) {
      return null;
    }
    result.push({
      id: data.id,
      name: data.name,
      sequence: data.sequence,
      starts_on: data.starts_on,
      ends_on: data.ends_on,
      academic_year_id: data.academic_year_id,
    });
  }
  return result;
}

/** No modo pré-cifragem, não existe persistência de dados pessoais. */
export function isOfflineQueryKey(key: QueryKey): boolean {
  return OFFLINE_QUERY_PREFIXES.some(
    (allowed) => allowed.length === key.length && allowed.every((part, i) => part === key[i]),
  );
}

export function offlineQueriesStorageKey(schoolId: string | null): string {
  return `${STORAGE_PREFIX}:${schoolId ?? "default"}`;
}

/** Elimina todas as cópias antigas que incluíam dados bancários e de calendário. */
function removeLegacyCache(): void {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(`${LEGACY_STORAGE_PREFIX}:`)) localStorage.removeItem(key);
    }
  } catch {
    // O armazenamento pode estar bloqueado. Nunca usar dados antigos.
  }
}

/**
 * Repõe apenas os metadados explicitamente reconhecidos e dentro da validade.
 * Não faz hydrate() de JSON local não confiável, que poderia introduzir queries
 * privadas ou estruturas inesperadas no QueryClient.
 */
export function restoreOfflineQueries(queryClient: QueryClient, schoolId: string | null): boolean {
  removeLegacyCache();
  if (!schoolId) return false;
  try {
    const raw = localStorage.getItem(offlineQueriesStorageKey(schoolId));
    if (!raw || new TextEncoder().encode(raw).length > MAX_BYTES) return false;
    const cache = JSON.parse(raw) as Partial<OfflineCache>;
    const now = Date.now();
    if (
      cache?.version !== CACHE_VERSION ||
      typeof cache.savedAt !== "number" ||
      !Number.isFinite(cache.savedAt) ||
      cache.savedAt > now ||
      now - cache.savedAt > MAX_AGE_MS
    ) {
      return false;
    }

    const years = cache.years === undefined ? null : cleanAcademicYears(cache.years);
    const terms = cache.terms === undefined ? null : cleanAcademicTerms(cache.terms);
    if (cache.years !== undefined && years === null) return false;
    if (cache.terms !== undefined && terms === null) return false;
    if (years === null && terms === null) return false;
    if (years) queryClient.setQueryData(["school", "academic-years"], years);
    if (terms) queryClient.setQueryData(["school", "academic-terms"], terms);
    return true;
  } catch {
    return false;
  }
}

/** Debounce das leituras mínimas; só serializa valores permitidos e validados. */
export function persistOfflineQueries(queryClient: QueryClient, schoolId: () => string | null) {
  removeLegacyCache();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const save = (schoolAtQuery: string) => {
    if (schoolId() !== schoolAtQuery) return;
    // Cada linha traz a escola certificada pelo servidor. Recusar respostas
    // antigas de outro tenant que tenham chegado após o utilizador trocar escola.
    const years = cleanAcademicYears(
      queryClient.getQueryData(["school", "academic-years"]),
      schoolAtQuery,
    );
    const terms = cleanAcademicTerms(
      queryClient.getQueryData(["school", "academic-terms"]),
      schoolAtQuery,
    );
    if (years === null && terms === null) return;

    const payload: OfflineCache = {
      version: CACHE_VERSION,
      savedAt: Date.now(),
      ...(years === null ? {} : { years }),
      ...(terms === null ? {} : { terms }),
    };
    const value = JSON.stringify(payload);
    if (new TextEncoder().encode(value).length > MAX_BYTES) return;
    try {
      localStorage.setItem(offlineQueriesStorageKey(schoolAtQuery), value);
    } catch {
      // Sem espaço/permissões: a aplicação continua sem cache.
    }
  };

  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== "updated" || event.action.type !== "success") return;
    if (!isOfflineQueryKey(event.query.queryKey)) return;
    const schoolAtQuery = schoolId();
    if (!schoolAtQuery) return;
    clearTimeout(timer);
    timer = setTimeout(() => save(schoolAtQuery), 1000);
  });

  return () => {
    clearTimeout(timer);
    unsubscribe();
  };
}

/** No fim de sessão, elimina tanto o formato mínimo actual como os antigos. */
export function clearOfflineQueries(): void {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(`${STORAGE_PREFIX}:`) || key.startsWith(`${LEGACY_STORAGE_PREFIX}:`)) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // Sem armazenamento local: nada a apagar.
  }
}
