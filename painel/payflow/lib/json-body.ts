/**
 * Leitura limitada do corpo JSON dos endpoints PayFlow.
 *
 * `request.json()` lê o corpo inteiro para memória antes de validar: um pedido
 * de dezenas de MB esgotava o Worker antes de o esquema o recusar. Aqui o corpo
 * é lido em blocos e a leitura pára no limite.
 *
 * Nunca lança: devolve `undefined` quando o corpo excede o limite ou não é JSON
 * válido, para o `safeParse` de cada endpoint responder como pedido inválido.
 */
export const DEFAULT_JSON_BODY_LIMIT = 256 * 1024;

export async function readJsonBody(
  request: Request,
  maxBytes: number = DEFAULT_JSON_BODY_LIMIT,
): Promise<unknown> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return undefined;
  const reader = request.body?.getReader();
  if (!reader) return undefined;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return undefined;
      }
      chunks.push(value);
    }
  } catch {
    return undefined;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return undefined;
  }
}
