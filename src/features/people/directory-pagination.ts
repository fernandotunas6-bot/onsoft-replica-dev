/**
 * Paginação exacta quando o critério depende de relações ou de informação
 * mascarada por autorização: filtrar ANTES de contar e seleccionar a página.
 * Não devolver totais parciais quando o limite operacional for atingido.
 */
export interface DirectoryPage<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const DIRECTORY_BATCH_SIZE = 200;
export const DIRECTORY_MAX_BATCHES = 250;

export async function scanDirectoryPage<TSource, TRow>({
  page,
  pageSize,
  read,
  prepare,
  batchSize = DIRECTORY_BATCH_SIZE,
  maxBatches = DIRECTORY_MAX_BATCHES,
}: {
  page: number;
  pageSize: number;
  read: (offset: number, size: number) => Promise<TSource[]>;
  prepare: (batch: TSource[]) => Promise<TRow[]>;
  batchSize?: number;
  maxBatches?: number;
}): Promise<DirectoryPage<TRow>> {
  if (!Number.isSafeInteger(page) || page < 1) throw new Error("Página inválida.");
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new Error("Tamanho de página inválido.");
  }
  if (!Number.isSafeInteger(batchSize) || batchSize < 1) throw new Error("Lote inválido.");
  if (!Number.isSafeInteger(maxBatches) || maxBatches < 1) {
    throw new Error("Limite de leitura inválido.");
  }
  const start = (page - 1) * pageSize;
  const items: TRow[] = [];
  let total = 0;
  for (let index = 0; index < maxBatches; index += 1) {
    const source = await read(index * batchSize, batchSize);
    if (source.length > batchSize) throw new Error("A base devolveu mais linhas do que o pedido.");
    const filtered = await prepare(source);
    for (const row of filtered) {
      if (total >= start && total < start + pageSize) items.push(row);
      total += 1;
    }
    if (source.length < batchSize) return { items, total, page, pageSize };
  }
  throw new Error(
    "Esta pesquisa excede o limite de leitura segura. Refine os filtros ou contacte a administração.",
  );
}
