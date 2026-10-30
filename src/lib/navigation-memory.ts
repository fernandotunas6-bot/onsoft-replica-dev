/**
 * Memória de navegação do dispositivo: páginas recentes e favoritos.
 * Persistência local por utilizador **e escola** (SIGA Context Engine): guarda só
 * caminho, parâmetros e rótulo do caminho, sem dados de alunos. Uma conta com duas
 * escolas não vê na segunda os recentes da primeira, e terminar sessão apaga os
 * recentes. Quem restaura um destino continua a passar pela página, que valida no
 * servidor.
 */

export type NavMemoryItem = {
  path: string;
  label: string;
  search?: string;
  at: number;
};

const RECENT_LIMIT = 8;
const FAVORITE_LIMIT = 12;

const RECENT_PREFIX = "siga:nav-recent:";
const FAVORITE_PREFIX = "siga:nav-favorite:";

/**
 * O dono da memória: utilizador e escola. As funções abaixo recebem este valor;
 * sem escola (conta ainda a carregar) fica numa memória à parte.
 */
export function navMemoryOwner(userId: string, schoolId: string | null | undefined): string {
  return `${userId}:${schoolId || "sem-escola"}`;
}

function recentKey(owner: string) {
  return `${RECENT_PREFIX}${owner}`;
}

function favoriteKey(owner: string) {
  return `${FAVORITE_PREFIX}${owner}`;
}

function readList(key: string): NavMemoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as NavMemoryItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) =>
        item &&
        typeof item.path === "string" &&
        typeof item.label === "string" &&
        typeof item.at === "number",
    );
  } catch {
    return [];
  }
}

function writeList(key: string, items: NavMemoryItem[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch {
    /* quota / private mode */
  }
}

function removeKey(key: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(key);
  } catch {
    /* private mode */
  }
}

const ENTITY_ID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Um destino que aponta para uma entidade (aluno, turma, professor…) pelo id. */
export function navItemHasEntityId(item: Pick<NavMemoryItem, "path" | "search">): boolean {
  return ENTITY_ID.test(item.path) || ENTITY_ID.test(item.search ?? "");
}

/**
 * Memória antiga, só por utilizador (`siga:nav-…:<userId>`): os recentes saem,
 * porque podiam ser de outra escola; os favoritos sem id de entidade passam para a
 * escola actual, e os que apontam para uma entidade saem pela mesma razão.
 */
export function migrateLegacyNavMemory(userId: string, owner: string) {
  if (!userId || owner === userId) return;
  const legacyFavorites = readList(favoriteKey(userId));
  removeKey(recentKey(userId));
  removeKey(favoriteKey(userId));
  const keep = legacyFavorites.filter((item) => !navItemHasEntityId(item));
  if (keep.length === 0) return;
  const current = readList(favoriteKey(owner));
  const known = new Set(current.map(itemKey));
  const merged = [...current, ...keep.filter((item) => !known.has(itemKey(item)))];
  writeList(favoriteKey(owner), merged.slice(0, FAVORITE_LIMIT));
}

/** Terminar sessão apaga os recentes de todas as contas e escolas deste dispositivo. */
export function clearRecentNav() {
  if (typeof window === "undefined") return;
  try {
    const keys: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(RECENT_PREFIX)) keys.push(key);
    }
    keys.forEach(removeKey);
  } catch {
    /* private mode */
  }
}

export function itemKey(item: Pick<NavMemoryItem, "path" | "search">) {
  return `${item.path}${item.search ? `?${item.search}` : ""}`;
}

export function readRecentNav(owner: string): NavMemoryItem[] {
  return readList(recentKey(owner)).slice(0, RECENT_LIMIT);
}

export function touchRecentNav(
  owner: string,
  entry: { path: string; label: string; search?: string },
) {
  if (!owner || entry.path === "/login") return readRecentNav(owner);
  const next: NavMemoryItem = {
    path: entry.path,
    label: entry.label,
    search: entry.search,
    at: Date.now(),
  };
  const filtered = readRecentNav(owner).filter((item) => itemKey(item) !== itemKey(next));
  const list = [next, ...filtered].slice(0, RECENT_LIMIT);
  writeList(recentKey(owner), list);
  return list;
}

export function readFavoriteNav(owner: string): NavMemoryItem[] {
  return readList(favoriteKey(owner)).slice(0, FAVORITE_LIMIT);
}

export function isFavoriteNav(
  owner: string,
  entry: Pick<NavMemoryItem, "path" | "search">,
): boolean {
  return readFavoriteNav(owner).some((item) => itemKey(item) === itemKey(entry));
}

export function toggleFavoriteNav(
  owner: string,
  entry: { path: string; label: string; search?: string },
): NavMemoryItem[] {
  if (!owner) return [];
  const current = readFavoriteNav(owner);
  const key = itemKey(entry);
  const exists = current.some((item) => itemKey(item) === key);
  const next = exists
    ? current.filter((item) => itemKey(item) !== key)
    : [
        { path: entry.path, label: entry.label, search: entry.search, at: Date.now() },
        ...current,
      ].slice(0, FAVORITE_LIMIT);
  writeList(favoriteKey(owner), next);
  return next;
}

/** Rótulos humanos para paths conhecidos do SIGA. */
export function labelForPath(pathname: string): string {
  const map: Record<string, string> = {
    "/": "Início",
    "/alunos": "Alunos",
    "/pessoas": "Pessoas",
    "/pedagogica": "Área Pedagógica",
    "/calendario": "Calendário",
    "/planos-aula": "Planos de Aula",
    "/financeiro": "Tesouraria",
    "/financeiro/rh": "RH e Folha",
    "/faturas": "Faturas",
    "/documentos": "Documentos",
    "/comunicacoes": "Comunicações",
    "/arquivos": "Arquivos",
    "/importar": "Importação",
    "/configuracoes": "Definições",
    "/professor/presenca": "Presença (QR)",
    "/acessos": "Acessos",
    "/catracas": "Catracas",
    "/relatorios/financeiros": "Relatórios Financeiros",
    "/relatorios/academicos": "Relatórios Académicos",
  };
  if (map[pathname]) return map[pathname]!;
  const parts = pathname.split("/").filter(Boolean);
  return parts.at(-1)?.replace(/-/g, " ") ?? pathname;
}
