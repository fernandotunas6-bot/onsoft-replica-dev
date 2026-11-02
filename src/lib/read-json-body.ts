/**
 * Leitura de JSON com limite efectivo de bytes (incluindo corpo chunked).
 *
 * Content-Length é apenas um atalho para rejeitar cedo: NÃO é uma fonte fiável
 * para medir o tamanho real, que é sempre conferido durante a leitura.
 * Destinado a entradas públicas sensíveis; não substitui validação Zod.
 */
export type LimitedJsonResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: "invalid_json" | "too_large" };

export async function readJsonBodyLimited(
  request: Request,
  maxBytes: number,
): Promise<LimitedJsonResult> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new RangeError("maxBytes tem de ser um inteiro positivo.");
  }

  const declaredLength = request.headers.get("content-length");
  if (declaredLength && /^\d+$/.test(declaredLength)) {
    const bytes = Number(declaredLength);
    if (bytes > maxBytes) return { ok: false, reason: "too_large" };
  }

  if (!request.body) return { ok: false, reason: "invalid_json" };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: "too_large" };
      }
      chunks.push(value);
    }

    const data = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      data.set(chunk, offset);
      offset += chunk.byteLength;
    }
    try {
      return {
        ok: true,
        value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(data)) as unknown,
      };
    } catch {
      return { ok: false, reason: "invalid_json" };
    }
  } catch {
    return { ok: false, reason: "invalid_json" };
  } finally {
    reader.releaseLock();
  }
}
