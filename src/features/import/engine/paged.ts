/**
 * Lê uma tabela inteira em páginas.
 *
 * O PostgREST devolve no máximo 1000 linhas por pedido (e corta sem erro), e um
 * `.in("id", [...])` com centenas de ids passa o tamanho máximo do URL. Os
 * importadores carregam alunos, pessoas e matrículas da escola inteira para
 * encontrar correspondências: numa escola real, com mais de mil alunos, a lista
 * vinha cortada — alunos existentes não eram reconhecidos e a mesma pessoa era
 * criada outra vez.
 *
 * `build(from, to)` tem de devolver a consulta já ordenada por uma coluna única
 * (normalmente `id`), para as páginas não se sobreporem.
 */
export const IMPORT_PAGE_SIZE = 1000;
/** Tecto de segurança: nenhuma escola chega perto, e um ciclo nunca fica sem fim. */
const MAX_PAGES = 200;

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

export async function selectAllPages<T>(
  build: (from: number, to: number) => PromiseLike<PageResult<T>>,
  errorPrefix: string,
  pageSize = IMPORT_PAGE_SIZE,
): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * pageSize;
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw new Error(`${errorPrefix}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}
