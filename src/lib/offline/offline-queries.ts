import { dehydrate, hydrate, type QueryClient, type QueryKey } from "@tanstack/react-query";

/**
 * Consultas guardadas para abrir a app desktop sem rede.
 *
 * Só dados da instituição, sem dados pessoais (decisão do dono): configurações da escola
 * (nome, NIF, contactos e IBAN da escola, marca), anos e períodos lectivos, calendário
 * escolar e salas. Turmas e disciplinas vêm do servidor juntas com listas de alunos, por
 * isso ficam de fora.
 *
 * Usadas só quando a app abre sem rede: com rede, tudo vem fresco do servidor (assim um
 * formulário nunca arranca com dados antigos). Ficam no localStorage do WebView da app,
 * por escola, e saem ao terminar sessão.
 */
export const OFFLINE_QUERY_PREFIXES: readonly QueryKey[] = [
  ["school", "settings"],
  ["school", "academic-years"],
  ["school", "academic-terms"],
  ["calendar", "events"],
  ["academic", "rooms"],
];

const STORAGE_PREFIX = "siga:offline-queries:v1";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_BYTES = 512 * 1024;

export function isOfflineQueryKey(key: QueryKey) {
  return OFFLINE_QUERY_PREFIXES.some((prefix) =>
    prefix.every((part, index) => key[index] === part),
  );
}

export function offlineQueriesStorageKey(schoolId: string | null) {
  return `${STORAGE_PREFIX}:${schoolId ?? "default"}`;
}

/** Repõe as consultas guardadas. Só faz sentido quando a app abriu sem rede. */
export function restoreOfflineQueries(queryClient: QueryClient, schoolId: string | null) {
  try {
    const raw = localStorage.getItem(offlineQueriesStorageKey(schoolId));
    if (!raw) return false;
    const saved = JSON.parse(raw) as { savedAt: number; state: unknown };
    if (!saved?.state || Date.now() - saved.savedAt > MAX_AGE_MS) return false;
    hydrate(queryClient, saved.state);
    return true;
  } catch {
    return false;
  }
}

/** Guarda (com pausa de 1 s entre gravações) as consultas da lista quando mudam. */
export function persistOfflineQueries(queryClient: QueryClient, schoolId: () => string | null) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const save = () => {
    const state = dehydrate(queryClient, {
      shouldDehydrateQuery: (query) =>
        query.state.status === "success" && isOfflineQueryKey(query.queryKey),
    });
    if (state.queries.length === 0) return;
    const value = JSON.stringify({ savedAt: Date.now(), state });
    if (value.length > MAX_BYTES) return;
    try {
      localStorage.setItem(offlineQueriesStorageKey(schoolId()), value);
    } catch {
      // Armazenamento cheio ou bloqueado: a app continua, só sem esta cópia.
    }
  };
  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== "updated" || event.action.type !== "success") return;
    if (!isOfflineQueryKey(event.query.queryKey)) return;
    clearTimeout(timer);
    timer = setTimeout(save, 1000);
  });
  return () => {
    clearTimeout(timer);
    unsubscribe();
  };
}

/** Ao terminar sessão: apaga as cópias de todas as escolas. */
export function clearOfflineQueries() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(STORAGE_PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    // Sem armazenamento local: nada a apagar.
  }
}
