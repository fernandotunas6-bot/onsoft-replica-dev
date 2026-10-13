/**
 * Cliente do motor de inferência local — Ollama nativo, com recurso à API
 * compatível com OpenAI (LM Studio, llama.cpp).
 *
 * Contrato portado de `admin/app/services/ollama_service.ts` do Project NOMAD
 * (Apache-2.0, commit 54ee30a4…): quais os endpoints, em que ordem, e o recurso
 * de `/api/embed` para `/v1/embeddings` — que é o que faz o módulo funcionar
 * contra servidores que não são Ollama. A implementação é nossa, sobre `fetch`
 * nativo, para não acrescentar dependências nem quebrar o empacotamento.
 *
 * Tudo aqui é só-servidor: nenhum destes URL ou respostas chega ao browser sem
 * passar pelo gateway autenticado (`src/features/siga-ai/server.ts`).
 */
import {
  DEFAULT_CONTEXT_LENGTH,
  EMBEDDING_BATCH_SIZE,
  SAMPLER_AUTO,
} from "@/features/siga-ai/nomad-params";
import { parseOllamaLine, parseSseLine, splitLines } from "@/features/siga-ai/stream-parse";

export class AiServiceError extends Error {
  constructor(
    message: string,
    public code: "unreachable" | "model_missing" | "timeout" | "bad_response" | "aborted",
  ) {
    super(message);
  }
}

const DEFAULT_TIMEOUT_MS = 15_000;
const CHAT_TIMEOUT_MS = 180_000;

async function request(
  baseUrl: string,
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    return await fetch(`${baseUrl}${path}`, { ...rest, signal: controller.signal });
  } catch (error) {
    if (signal?.aborted) throw new AiServiceError("Pedido cancelado.", "aborted");
    if ((error as Error)?.name === "AbortError") {
      throw new AiServiceError("O serviço de IA não respondeu em tempo útil.", "timeout");
    }
    throw new AiServiceError(
      "Não foi possível contactar o serviço de IA. Verifique se está ligado.",
      "unreachable",
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

export type AiModel = { name: string; sizeBytes: number | null; parameterSize: number | null };

function parseParams(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const match = raw.match(/([\d.]+)\s*B/i);
  if (!match) return null;
  const value = Number.parseFloat(match[1]!);
  return Number.isFinite(value) ? value : null;
}

/**
 * Modelos instalados. Tenta `/api/tags` (Ollama) e, se não existir, `/v1/models`
 * (compatíveis com OpenAI) — é o que o NOMAD chama de "sonda de backend".
 */
export async function listModels(baseUrl: string, signal?: AbortSignal): Promise<AiModel[]> {
  const native = await request(baseUrl, "/api/tags", { signal }).catch((error) => {
    if (error instanceof AiServiceError && error.code === "unreachable") return null;
    throw error;
  });
  if (native?.ok) {
    const body = (await native.json()) as {
      models?: Array<{ name?: string; size?: number; details?: { parameter_size?: string } }>;
    };
    return (body.models ?? [])
      .filter((model): model is { name: string } & typeof model => typeof model.name === "string")
      .map((model) => ({
        name: model.name,
        sizeBytes: typeof model.size === "number" ? model.size : null,
        parameterSize: parseParams(model.details?.parameter_size),
      }));
  }

  const compat = await request(baseUrl, "/v1/models", { signal });
  if (!compat.ok) {
    throw new AiServiceError("O serviço de IA respondeu de forma inesperada.", "bad_response");
  }
  const body = (await compat.json()) as { data?: Array<{ id?: string }> };
  return (body.data ?? [])
    .filter((model): model is { id: string } => typeof model.id === "string")
    .map((model) => ({ name: model.id, sizeBytes: null, parameterSize: null }));
}

/** `/api/embed` com recurso a `/v1/embeddings` — ver nota de porte no topo. */
export async function embed(
  baseUrl: string,
  model: string,
  inputs: string[],
  signal?: AbortSignal,
): Promise<number[][]> {
  if (!inputs.length) return [];

  const native = await request(baseUrl, "/api/embed", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model, input: inputs, truncate: true }),
    timeoutMs: 120_000,
    signal,
  }).catch((error) => {
    if (error instanceof AiServiceError && error.code === "unreachable") return null;
    throw error;
  });

  if (native?.ok) {
    const body = (await native.json()) as { embeddings?: number[][] };
    if (Array.isArray(body.embeddings) && body.embeddings.length === inputs.length) {
      return body.embeddings;
    }
  } else if (native && native.status === 404) {
    const text = await native.text().catch(() => "");
    if (/model .* not found|pull/i.test(text)) {
      throw new AiServiceError(
        `O modelo de embeddings ${model} não está instalado neste servidor de IA.`,
        "model_missing",
      );
    }
  }

  const compat = await request(baseUrl, "/v1/embeddings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model, input: inputs }),
    timeoutMs: 120_000,
    signal,
  });
  if (!compat.ok) {
    if (compat.status === 404) {
      throw new AiServiceError(
        `O modelo de embeddings ${model} não está instalado neste servidor de IA.`,
        "model_missing",
      );
    }
    throw new AiServiceError("O serviço de embeddings respondeu com erro.", "bad_response");
  }
  const body = (await compat.json()) as { data?: Array<{ embedding?: number[] }> };
  const vectors = (body.data ?? []).map((item) => item.embedding ?? []);
  if (vectors.length !== inputs.length || vectors.some((vector) => !vector.length)) {
    throw new AiServiceError("Resposta de embeddings inválida.", "bad_response");
  }
  return vectors;
}

/** Embeddings em lotes de 8 (`EMBEDDING_BATCH_SIZE`), para hardware modesto. */
export async function embedBatched(
  baseUrl: string,
  model: string,
  inputs: string[],
  signal?: AbortSignal,
): Promise<number[][]> {
  const out: number[][] = [];
  for (let index = 0; index < inputs.length; index += EMBEDDING_BATCH_SIZE) {
    out.push(
      ...(await embed(baseUrl, model, inputs.slice(index, index + EMBEDDING_BATCH_SIZE), signal)),
    );
  }
  return out;
}

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

/**
 * Uma resposta completa (sem streaming nesta fase — ver auditoria §8). O
 * `signal` permite cancelar: é o que a interface usa no botão "parar".
 */
export async function chat(
  baseUrl: string,
  model: string,
  messages: ChatMessage[],
  options: { numCtx?: number; signal?: AbortSignal } = {},
): Promise<string> {
  const body = {
    model,
    messages,
    stream: false,
    options: {
      temperature: SAMPLER_AUTO.temperature,
      top_p: SAMPLER_AUTO.topP,
      top_k: SAMPLER_AUTO.topK,
      min_p: SAMPLER_AUTO.minP,
      repeat_penalty: SAMPLER_AUTO.repeatPenalty,
      num_ctx: options.numCtx ?? DEFAULT_CONTEXT_LENGTH,
    },
  };

  const native = await request(baseUrl, "/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    timeoutMs: CHAT_TIMEOUT_MS,
    signal: options.signal,
  }).catch((error) => {
    if (error instanceof AiServiceError && error.code === "unreachable") return null;
    throw error;
  });

  if (native?.ok) {
    const parsed = (await native.json()) as { message?: { content?: string } };
    const text = parsed.message?.content ?? "";
    if (text.trim()) return text;
    throw new AiServiceError("O modelo devolveu uma resposta vazia.", "bad_response");
  }
  if (native && native.status === 404) {
    throw new AiServiceError(
      `O modelo ${model} não está instalado neste servidor de IA.`,
      "model_missing",
    );
  }

  // Compatível com OpenAI (LM Studio, llama.cpp). Sem `num_ctx`: a API não o tem.
  const compat = await request(baseUrl, "/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      temperature: SAMPLER_AUTO.temperature,
      top_p: SAMPLER_AUTO.topP,
    }),
    timeoutMs: CHAT_TIMEOUT_MS,
    signal: options.signal,
  });
  if (!compat.ok) {
    if (compat.status === 404) {
      throw new AiServiceError(
        `O modelo ${model} não está instalado neste servidor de IA.`,
        "model_missing",
      );
    }
    throw new AiServiceError("O serviço de IA respondeu com erro.", "bad_response");
  }
  const parsed = (await compat.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = parsed.choices?.[0]?.message?.content ?? "";
  if (!text.trim())
    throw new AiServiceError("O modelo devolveu uma resposta vazia.", "bad_response");
  return text;
}

/**
 * A mesma conversa, token a token.
 *
 * Porque é que isto existe ao lado de `chat()`: num modelo local de 7B uma
 * resposta longa leva dezenas de segundos, e sem streaming o utilizador fica a
 * olhar para um indicador sem saber se está a funcionar. O `signal` corta o
 * pedido ao próprio motor de inferência — o «parar» passa a libertar o modelo,
 * em vez de só deixar o browser de esperar.
 *
 * Tenta o NDJSON nativo do Ollama e recorre ao SSE compatível com OpenAI, pela
 * mesma ordem de `chat()`.
 */
export async function* chatStream(
  baseUrl: string,
  model: string,
  messages: ChatMessage[],
  options: { numCtx?: number; signal?: AbortSignal } = {},
): AsyncGenerator<string, void, undefined> {
  const native = await request(baseUrl, "/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      options: {
        temperature: SAMPLER_AUTO.temperature,
        top_p: SAMPLER_AUTO.topP,
        top_k: SAMPLER_AUTO.topK,
        min_p: SAMPLER_AUTO.minP,
        repeat_penalty: SAMPLER_AUTO.repeatPenalty,
        num_ctx: options.numCtx ?? DEFAULT_CONTEXT_LENGTH,
      },
    }),
    timeoutMs: CHAT_TIMEOUT_MS,
    signal: options.signal,
  }).catch((error) => {
    if (error instanceof AiServiceError && error.code === "unreachable") return null;
    throw error;
  });

  if (native?.ok && native.body) {
    yield* readStream(native.body, parseOllamaLine);
    return;
  }
  if (native && native.status === 404) {
    throw new AiServiceError(
      `O modelo ${model} não está instalado neste servidor de IA.`,
      "model_missing",
    );
  }

  const compat = await request(baseUrl, "/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      temperature: SAMPLER_AUTO.temperature,
      top_p: SAMPLER_AUTO.topP,
    }),
    timeoutMs: CHAT_TIMEOUT_MS,
    signal: options.signal,
  });
  if (!compat.ok || !compat.body) {
    if (compat.status === 404) {
      throw new AiServiceError(
        `O modelo ${model} não está instalado neste servidor de IA.`,
        "model_missing",
      );
    }
    throw new AiServiceError("O serviço de IA respondeu com erro.", "bad_response");
  }
  yield* readStream(compat.body, parseSseLine);
}

/** Corpo da resposta → pedaços de texto, linha a linha, sem partir caracteres. */
async function* readStream(
  body: ReadableStream<Uint8Array>,
  parseLine: (line: string) => { text: string; done: boolean } | null,
): AsyncGenerator<string, void, undefined> {
  const reader = body.getReader();
  // `stream: true` no decoder é o que impede um «ç» partido entre dois pedaços
  // de chegar corrompido ao ecrã.
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const { lines, rest } = splitLines(buffer);
      buffer = rest;
      for (const line of lines) {
        const chunk = parseLine(line);
        if (!chunk) continue;
        if (chunk.text) yield chunk.text;
        if (chunk.done) return;
      }
    }
    const tail = parseLine(buffer.trim());
    if (tail?.text) yield tail.text;
  } finally {
    // Cancelar liberta a ligação (e o modelo) quando quem consome desiste.
    await reader.cancel().catch(() => {});
  }
}
