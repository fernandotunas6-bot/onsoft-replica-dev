/**
 * Memória de navegação do dispositivo: páginas recentes e favoritos.
 * Persistência local por utilizador — sem dados sensíveis de alunos.
 */

export type NavMemoryItem = {
  path: string;
  label: string;
  search?: string;
  at: number;
};

const RECENT_LIMIT = 8;
const FAVORITE_LIMIT = 12;

function recentKey(userId: string) {
  return `siga:nav-recent:${userId}`;
}

function favoriteKey(userId: string) {
  return `siga:nav-favorite:${userId}`;
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

export function itemKey(item: Pick<NavMemoryItem, "path" | "search">) {
  return `${item.path}${item.search ? `?${item.search}` : ""}`;
}

export function readRecentNav(userId: string): NavMemoryItem[] {
  return readList(recentKey(userId)).slice(0, RECENT_LIMIT);
}

export function touchRecentNav(
  userId: string,
  entry: { path: string; label: string; search?: string },
) {
  if (!userId || entry.path === "/login") return readRecentNav(userId);
  const next: NavMemoryItem = {
    path: entry.path,
    label: entry.label,
    search: entry.search,
    at: Date.now(),
  };
  const filtered = readRecentNav(userId).filter((item) => itemKey(item) !== itemKey(next));
  const list = [next, ...filtered].slice(0, RECENT_LIMIT);
  writeList(recentKey(userId), list);
  return list;
}

export function readFavoriteNav(userId: string): NavMemoryItem[] {
  return readList(favoriteKey(userId)).slice(0, FAVORITE_LIMIT);
}

export function isFavoriteNav(
  userId: string,
  entry: Pick<NavMemoryItem, "path" | "search">,
): boolean {
  return readFavoriteNav(userId).some((item) => itemKey(item) === itemKey(entry));
}

export function toggleFavoriteNav(
  userId: string,
  entry: { path: string; label: string; search?: string },
): NavMemoryItem[] {
  if (!userId) return [];
  const current = readFavoriteNav(userId);
  const key = itemKey(entry);
  const exists = current.some((item) => itemKey(item) === key);
  const next = exists
    ? current.filter((item) => itemKey(item) !== key)
    : [
        { path: entry.path, label: entry.label, search: entry.search, at: Date.now() },
        ...current,
      ].slice(0, FAVORITE_LIMIT);
  writeList(favoriteKey(userId), next);
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
