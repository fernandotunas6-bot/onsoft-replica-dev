/**
 * Leituras completas para o Superior. O PostgREST corta cada resposta em 1000
 * linhas sem erro, e um `.in()` com centenas de ids passa o tamanho do URL.
 * Numa universidade real (mais de mil matrículas, dez ou mais registos por
 * estudante) as pautas, a inscrição em lote e os mapas oficiais ficavam com
 * estudantes a menos.
 */
type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

export const PAGE_SIZE = 1000;
export const IN_CHUNK = 150;
/** Tecto de segurança: um ciclo nunca fica sem fim. */
const MAX_PAGES = 500;

/** Todas as páginas. `build` tem de ordenar por uma coluna única e aplicar `.range(from, to)`. */
export async function allPages<T>(
  build: (from: number, to: number) => Page<T>,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const rows: T[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_SIZE;
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error) return { data: rows, error };
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return { data: rows, error: null };
}

/** Todas as linhas para `ids`, em blocos de 150 e, em cada bloco, em páginas. */
export async function allPagesIn<T>(
  ids: readonly string[],
  build: (chunk: string[], from: number, to: number) => Page<T>,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const unique = [...new Set(ids)];
  const rows: T[] = [];
  for (let i = 0; i < unique.length; i += IN_CHUNK) {
    const chunk = unique.slice(i, i + IN_CHUNK);
    const { data, error } = await allPages((from, to) => build(chunk, from, to));
    rows.push(...data);
    if (error) return { data: rows, error };
  }
  return { data: rows, error: null };
}
