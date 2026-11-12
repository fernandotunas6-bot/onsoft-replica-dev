/**
 * Carregamento completo dos recibos de uma lista de faturas.
 *
 * PostgREST limita cada SELECT a 1000 linhas; uma escola pode ter vários
 * pagamentos parciais por fatura. Nunca apresentar dívida calculada sobre
 * apenas a primeira página de recibos, nem contar recibos de outra escola.
 *
 * O chamador fornece uma consulta já filtrada por escola e IDs das faturas;
 * cada lote de IDs é percorrido até ao fim, com ordenação estável por ID.
 */
export type InvoiceReceiptRow = {
  id: string;
  invoice_id: string;
  amount: number;
  status: string;
};

export type InvoiceReceiptPage<E> = {
  data: InvoiceReceiptRow[] | null;
  error: E | null;
};

export async function loadCompleteInvoiceReceipts<E>(
  invoiceIds: readonly string[],
  read: (ids: string[], from: number, to: number) => PromiseLike<InvoiceReceiptPage<E>>,
  options: { idsPerQuery?: number; rowsPerPage?: number; maxPages?: number } = {},
): Promise<{ data: InvoiceReceiptRow[]; error: E | null }> {
  const ids = [...new Set(invoiceIds)];
  const idsPerQuery = options.idsPerQuery ?? 150;
  const rowsPerPage = options.rowsPerPage ?? 1000;
  const maxPages = options.maxPages ?? 100;
  if (idsPerQuery < 1 || rowsPerPage < 1 || maxPages < 1) {
    throw new Error("Parâmetros de paginação de recibos inválidos.");
  }
  const receipts: InvoiceReceiptRow[] = [];
  for (let i = 0; i < ids.length; i += idsPerQuery) {
    const chunk = ids.slice(i, i + idsPerQuery);
    let finished = false;
    for (let page = 0; page < maxPages; page += 1) {
      const from = page * rowsPerPage;
      const { data, error } = await read(chunk, from, from + rowsPerPage - 1);
      if (error) return { data: [], error };
      const found = data ?? [];
      receipts.push(...found);
      if (found.length < rowsPerPage) {
        finished = true;
        break;
      }
    }
    if (!finished) {
      // Atingir o tecto não significa fim da lista; devolver explicitamente
      // um erro evita um saldo incompleto aparentemente correcto.
      throw new Error(
        "A quantidade de recibos excede o limite de leitura segura. Refine a consulta.",
      );
    }
  }
  return { data: receipts, error: null };
}

/** Recibos válidos, somados em cêntimos; estornos nunca liquidam dívidas. */
export function receiptsPaidByInvoice(
  rows: readonly Pick<InvoiceReceiptRow, "invoice_id" | "amount" | "status">[],
) {
  const cents = new Map<string, number>();
  for (const row of rows) {
    if (row.status === "reversed") continue;
    cents.set(
      row.invoice_id,
      (cents.get(row.invoice_id) ?? 0) + Math.round(Number(row.amount ?? 0) * 100),
    );
  }
  return new Map([...cents.entries()].map(([invoiceId, paid]) => [invoiceId, paid / 100]));
}
