/**
 * Leitura de respostas em *streaming* — lógica pura, sem rede.
 *
 * Três formatos encontram-se aqui:
 *  - **NDJSON do Ollama** (`/api/chat` com `stream: true`): um objecto JSON por
 *    linha, com `message.content` incremental e `done: true` no fim.
 *  - **SSE compatível com OpenAI** (`/v1/chat/completions`): linhas `data: {…}`
 *    com `choices[0].delta.content`, terminadas por `data: [DONE]`.
 *  - **NDJSON do gateway SIGA** (o nosso protocolo para o browser), onde cada
 *    linha é `{type:"token"|"done"|"error", …}`.
 *
 * Um pedaço da rede corta onde quer, inclusive no meio de uma linha e no meio
 * de um caractere multibyte. É por isso que o acumulador devolve sempre o
 * resto: sem isso, um «ç» partido entre dois pedaços chegava corrompido ao ecrã.
 */

/** Separa as linhas completas de um acumulador, devolvendo o que ficou a meio. */
export function splitLines(buffer: string): { lines: string[]; rest: string } {
  const parts = buffer.split("\n");
  const rest = parts.pop() ?? "";
  return { lines: parts.map((line) => line.replace(/\r$/, "")).filter(Boolean), rest };
}

export type UpstreamChunk = { text: string; done: boolean };

/** Uma linha NDJSON do Ollama. Linha ilegível devolve `null` (ignora-se). */
export function parseOllamaLine(line: string): UpstreamChunk | null {
  try {
    const parsed = JSON.parse(line) as {
      message?: { content?: unknown };
      response?: unknown;
      done?: unknown;
      error?: unknown;
    };
    if (typeof parsed.error === "string" && parsed.error) {
      throw new Error(parsed.error);
    }
    const content =
      typeof parsed.message?.content === "string"
        ? parsed.message.content
        : typeof parsed.response === "string"
          ? parsed.response
          : "";
    return { text: content, done: parsed.done === true };
  } catch (error) {
    if (error instanceof Error && error.message && !(error instanceof SyntaxError)) throw error;
    return null;
  }
}

/** Uma linha SSE da API compatível com OpenAI. */
export function parseSseLine(line: string): UpstreamChunk | null {
  if (!line.startsWith("data:")) return null;
  const payload = line.slice(5).trim();
  if (!payload) return null;
  if (payload === "[DONE]") return { text: "", done: true };
  try {
    const parsed = JSON.parse(payload) as {
      choices?: Array<{ delta?: { content?: unknown }; finish_reason?: unknown }>;
    };
    const choice = parsed.choices?.[0];
    const content = typeof choice?.delta?.content === "string" ? choice.delta.content : "";
    return { text: content, done: Boolean(choice?.finish_reason) };
  } catch {
    return null;
  }
}

// --- Protocolo do gateway SIGA → browser -----------------------------------

export type GatewayEvent =
  | { type: "token"; text: string }
  | {
      type: "done";
      conversationId: string;
      citations: Array<{
        documentId: string;
        documentTitle: string;
        chunkIndex: number;
        score: number;
        excerpt: string;
      }>;
      model: string;
      usedKnowledgeBase: boolean;
    }
  | { type: "error"; message: string };

export function encodeGatewayEvent(event: GatewayEvent): string {
  return `${JSON.stringify(event)}\n`;
}

/** Linha do gateway → evento. Linha inválida devolve `null`. */
export function parseGatewayEvent(line: string): GatewayEvent | null {
  try {
    const parsed = JSON.parse(line) as Partial<GatewayEvent> & { type?: string };
    if (parsed.type === "token" && typeof (parsed as { text?: unknown }).text === "string") {
      return { type: "token", text: (parsed as { text: string }).text };
    }
    if (parsed.type === "done") return parsed as GatewayEvent;
    if (parsed.type === "error") {
      const message = (parsed as { message?: unknown }).message;
      return { type: "error", message: typeof message === "string" ? message : "Erro na IA." };
    }
    return null;
  } catch {
    return null;
  }
}
