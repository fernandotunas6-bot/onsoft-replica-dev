/**
 * Pesquisa do catálogo, local e sem serviços externos: corre no browser e no
 * servidor sobre os dados de `data/`, sem chamadas a IA.
 *
 * Por ordem de relevância: código exacto, sinónimo exacto, início do nome,
 * iniciais («emc» → Educação Moral e Cívica), início de uma palavra
 * («mat» → Métodos Matemáticos), texto contido e, por fim, erro tipográfico
 * (uma ou duas letras trocadas, conforme o tamanho). Ignora acentos e
 * maiúsculas.
 */

const STOPWORDS = new Set([
  "de",
  "da",
  "do",
  "das",
  "dos",
  "e",
  "a",
  "o",
  "em",
  "ao",
  "à",
  "às",
  "para",
]);

/** «Educação  Física» → «educacao fisica». */
export function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function initials(value: string) {
  return normalizeText(value)
    .split(" ")
    .filter((w) => w && !STOPWORDS.has(w))
    .map((w) => w[0])
    .join("");
}

/** Distância de Damerau-Levenshtein (transposições contam 1), com corte. */
export function editDistance(a: string, b: string, max = 2) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, (_, i) =>
    Array.from({ length: cols }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i < rows; i += 1) {
    let rowMin = Infinity;
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, d[i - 2]![j - 2]! + 1);
      }
      d[i]![j] = v;
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length]![b.length]!;
}

export type Searchable = {
  code: string;
  name: string;
  aliases?: readonly string[];
  short?: string;
};

export type MatchKind = "code" | "alias" | "prefix" | "initials" | "word" | "contains" | "typo";

const SCORE: Record<MatchKind, number> = {
  code: 100,
  alias: 95,
  prefix: 90,
  initials: 85,
  word: 80,
  contains: 60,
  typo: 50,
};

type Prepared = {
  code: string;
  names: string[];
  words: string[];
  initials: string[];
};

const prepared = new WeakMap<object, Prepared>();

function prepare(item: Searchable): Prepared {
  const cached = prepared.get(item);
  if (cached) return cached;
  const names = [item.name, item.short ?? "", ...(item.aliases ?? [])]
    .map(normalizeText)
    .filter(Boolean);
  const value: Prepared = {
    code: normalizeText(item.code),
    names,
    words: [
      ...new Set(
        names.flatMap((n) => n.split(" ")).filter((w) => w.length > 1 && !STOPWORDS.has(w)),
      ),
    ],
    initials: [
      ...new Set([item.name, ...(item.aliases ?? [])].map(initials).filter((i) => i.length > 1)),
    ],
  };
  prepared.set(item, value);
  return value;
}

/** Melhor forma de `item` corresponder à pesquisa, ou `null`. */
export function matchItem(
  item: Searchable,
  rawQuery: string,
): { kind: MatchKind; score: number } | null {
  const q = normalizeText(rawQuery);
  if (!q) return null;
  const p = prepare(item);
  const hit = (kind: MatchKind, bonus = 0) => ({ kind, score: SCORE[kind] + bonus });

  if (p.code === q) return hit("code");
  if (p.names.slice(1).includes(q)) return hit("alias");
  if (p.names[0] === q) return hit("alias", 4);
  // Nome mais curto ganha entre os que começam igual: «mat» → Matemática antes de Matemática A.
  const prefixed = p.names.filter((n) => n.startsWith(q));
  if (prefixed.length)
    return hit("prefix", Math.max(0, 5 - Math.min(...prefixed.map((n) => n.length)) / 10));
  if (q.length >= 2 && p.initials.includes(q.replace(/ /g, ""))) return hit("initials");
  const qWords = q.split(" ");
  if (qWords.every((qw) => p.words.some((w) => w.startsWith(qw)))) return hit("word");
  if (q.length >= 3 && p.names.some((n) => n.includes(q))) return hit("contains");
  if (q.length >= 4) {
    const max = q.length >= 7 ? 2 : 1;
    const close = qWords.every((qw) =>
      qw.length < 4
        ? p.words.some((w) => w.startsWith(qw))
        : p.words.some(
            (w) =>
              editDistance(qw, w.slice(0, qw.length), max) <= max ||
              editDistance(qw, w, max) <= max,
          ),
    );
    if (close) return hit("typo");
  }
  return null;
}

export type SearchResult<T> = { item: T; kind: MatchKind; score: number };

/** Ordena por relevância, depois por nome; `limit` corta a lista. */
export function searchItems<T extends Searchable>(
  items: readonly T[],
  query: string,
  limit = 20,
): SearchResult<T>[] {
  const out: SearchResult<T>[] = [];
  for (const item of items) {
    const m = matchItem(item, query);
    if (m) out.push({ item, ...m });
  }
  out.sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name, "pt"));
  return out.slice(0, limit);
}
