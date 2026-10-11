/**
 * Lê todas as linhas de uma consulta, por páginas.
 *
 * O PostgREST devolve no máximo 1000 linhas por pedido e corta sem erro: um
 * `.limit(5000)` recebe 1000. Os totais do painel (faturas e recibos cortados
 * cada um à sua maneira — uma fatura paga cujo recibo ficava de fora contava como
 * dívida), a lista de telefones conhecidos das mensagens e as contagens por
 * estado ficavam calculados sobre parte dos dados.
 *
 * Ao contrário de `selectAllPages` (importação), não lança: devolve o erro como o
 * cliente do Supabase, para quem lê manter o comportamento que já tinha. Em erro
 * não devolve linhas parciais.
 *
 * `build(from, to)` tem de devolver a consulta ordenada por uma coluna única
 * (normalmente `id`), para as páginas não se sobreporem.
 */
export const READ_PAGE_SIZE = 1000;
/** Tecto de segurança: 100 000 linhas. Um ciclo nunca fica sem fim. */
const MAX_PAGES = 100;

type Page<T, E> = { data: T[] | null; error: E | null };

export async function readAllPages<T, E = { message: string }>(
  build: (from: number, to: number) => PromiseLike<Page<T, E>>,
  pageSize = READ_PAGE_SIZE,
): Promise<{ data: T[]; error: E | null }> {
  const rows: T[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * pageSize;
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) return { data: [], error };
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return { data: rows, error: null };
}

/**
 * Ids por pedido num `.in(...)`: a lista vai no URL, e centenas de uuids passam o
 * tamanho máximo. 150 ids lidos pela chave primária também ficam abaixo das 1000 linhas.
 */
export const ID_CHUNK_SIZE = 150;

/**
 * Lê as linhas de uma lista de ids em lotes (`build` recebe cada lote). Só para
 * leituras de uma linha por id (chave primária); com várias linhas por id, usar
 * `readAllPages` dentro de cada lote. Como `readAllPages`, devolve o erro em vez de lançar.
 */
export async function readInChunks<T, E = { message: string }>(
  ids: readonly string[],
  build: (chunk: string[]) => PromiseLike<Page<T, E>>,
  chunkSize = ID_CHUNK_SIZE,
): Promise<{ data: T[]; error: E | null }> {
  const unique = [...new Set(ids)];
  const rows: T[] = [];
  for (let i = 0; i < unique.length; i += chunkSize) {
    const { data, error } = await build(unique.slice(i, i + chunkSize));
    if (error) return { data: [], error };
    rows.push(...(data ?? []));
  }
  return { data: rows, error: null };
}
