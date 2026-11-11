/**
 * Leitura do corpo dos pedidos com limite efectivo de bytes (incluindo corpo chunked).
 *
 * Um Worker tem 128 MB de memória e a Cloudflare aceita corpos até 100 MB: um
 * `request.json()` ou `request.text()` sem limite deixava qualquer pessoa, sem sessão
 * (webhooks e rotas públicas lêem o corpo antes de verificar assinaturas ou tokens),
 * ocupar a memória do isolado com um único pedido. Todas as rotas de `src/routes/api/`
 * lêem o corpo por aqui (tests/security/api-body-limits.test.ts).
 *
 * Content-Length é apenas um atalho para rejeitar cedo: NÃO é uma fonte fiável
 * para medir o tamanho real, que é sempre conferido durante a leitura.
 * Não substitui a validação com Zod.
 */

/** Limites por tipo de pedido. Uma rota com outra necessidade declara o seu, com o motivo. */
export const BODY_LIMITS = {
  /** Poucos campos curtos: códigos, catracas, notificações, presença. */
  small: 16 * 1024,
  /** Formulários e operações da consola e da app (incluindo a lista de uma turma). */
  standard: 256 * 1024,
  /** Avisos de fornecedores: pagamentos, e-mail e SMS. */
  webhook: 1024 * 1024,
} as const;

export type LimitedJsonResult =
  { ok: true; value: unknown } | { ok: false; reason: "invalid_json" | "too_large" };

export type LimitedTextResult =
  { ok: true; text: string } | { ok: false; reason: "unreadable" | "too_large" };

type LimitedBytesResult =
  { ok: true; bytes: Uint8Array } | { ok: false; reason: "unreadable" | "too_large" };

async function readBytesLimited(request: Request, maxBytes: number): Promise<LimitedBytesResult> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new RangeError("maxBytes tem de ser um inteiro positivo.");
  }

  const declaredLength = request.headers.get("content-length");
  if (declaredLength && /^\d+$/.test(declaredLength)) {
    const bytes = Number(declaredLength);
    if (bytes > maxBytes) return { ok: false, reason: "too_large" };
  }

  if (!request.body) return { ok: true, bytes: new Uint8Array(0) };

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
  } catch {
    return { ok: false, reason: "unreadable" };
  } finally {
    reader.releaseLock();
  }

  const data = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, bytes: data };
}

/**
 * Corpo como texto, como o `request.text()` (UTF-8, sem falhar em bytes inválidos).
 * Para os webhooks: a assinatura cobre os bytes exactos recebidos.
 */
export async function readTextBodyLimited(
  request: Request,
  maxBytes: number,
): Promise<LimitedTextResult> {
  const read = await readBytesLimited(request, maxBytes);
  if (!read.ok) return read;
  return { ok: true, text: new TextDecoder("utf-8").decode(read.bytes) };
}

export async function readJsonBodyLimited(
  request: Request,
  maxBytes: number,
): Promise<LimitedJsonResult> {
  const read = await readBytesLimited(request, maxBytes);
  if (!read.ok)
    return { ok: false, reason: read.reason === "too_large" ? "too_large" : "invalid_json" };
  try {
    return {
      ok: true,
      value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(read.bytes)) as unknown,
    };
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
}

/** Estado HTTP e texto para um corpo recusado. */
export function rejectedBody(reason: "invalid_json" | "unreadable" | "too_large"): {
  status: 400 | 413;
  message: string;
} {
  if (reason === "too_large") return { status: 413, message: "Pedido demasiado grande." };
  return {
    status: 400,
    message: reason === "invalid_json" ? "Corpo JSON inválido." : "Corpo do pedido ilegível.",
  };
}
