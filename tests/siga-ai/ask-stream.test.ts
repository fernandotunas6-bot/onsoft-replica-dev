/**
 * Consumo do stream no browser. O que interessa fixar: os tokens chegam
 * inteiros mesmo quando a rede corta a meio de uma linha, uma falha de
 * streaming cai para a resposta completa, e uma falha de permissão **não** cai
 * — repetir daria o mesmo 401 por outro caminho.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: "t" } } }) } },
}));

const { askAiStreaming, StreamUnavailableError } = await import("@/features/siga-ai/ask-stream");

const INPUT = { question: "Quando vence a propina?", useKnowledgeBase: true };

/** Resposta com corpo em NDJSON, entregue nos pedaços exactos indicados. */
function streamResponse(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, { status });
}

const DONE_EVENT = {
  type: "done",
  conversationId: "c-1",
  citations: [],
  model: "qwen2.5:7b",
  usedKnowledgeBase: true,
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("siga-ai streaming no browser", () => {
  it("entrega os tokens e devolve o evento final", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        streamResponse([
          '{"type":"token","text":"A propina "}\n',
          '{"type":"token","text":"vence no dia 10."}\n',
          `${JSON.stringify(DONE_EVENT)}\n`,
        ]),
      ),
    );
    const tokens: string[] = [];
    const done = await askAiStreaming(INPUT, { onToken: (text) => tokens.push(text) });
    expect(tokens.join("")).toBe("A propina vence no dia 10.");
    expect(done.conversationId).toBe("c-1");
  });

  it("não parte um token quando a rede corta a meio da linha", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        streamResponse([
          '{"type":"token","text":"matr',
          'ícula"}\n',
          `${JSON.stringify(DONE_EVENT)}\n`,
        ]),
      ),
    );
    const tokens: string[] = [];
    await askAiStreaming(INPUT, { onToken: (text) => tokens.push(text) });
    expect(tokens).toEqual(["matrícula"]);
  });

  it("um 500 pede o caminho sem streaming, não um erro ao utilizador", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 500 })),
    );
    await expect(askAiStreaming(INPUT, { onToken: () => {} })).rejects.toBeInstanceOf(
      StreamUnavailableError,
    );
  });

  it("um 401 é erro para mostrar: repetir dava o mesmo", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: "Sessão inválida." }), {
            status: 401,
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    const failure = askAiStreaming(INPUT, { onToken: () => {} });
    await expect(failure).rejects.toThrow("Sessão inválida.");
    await expect(failure).rejects.not.toBeInstanceOf(StreamUnavailableError);
  });

  it("erro depois de já haver texto no ecrã é erro real, não recomeço", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        streamResponse([
          '{"type":"token","text":"metade"}\n',
          '{"type":"error","message":"O modelo caiu."}\n',
        ]),
      ),
    );
    const failure = askAiStreaming(INPUT, { onToken: () => {} });
    await expect(failure).rejects.toThrow("O modelo caiu.");
    await expect(failure).rejects.not.toBeInstanceOf(StreamUnavailableError);
  });

  it("stream que acaba sem evento final cai para o caminho completo", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => streamResponse(['{"type":"token","text":"a"}\n'])),
    );
    await expect(askAiStreaming(INPUT, { onToken: () => {} })).rejects.toBeInstanceOf(
      StreamUnavailableError,
    );
  });

  it("envia o token da sessão e o corpo da pergunta", async () => {
    const fetchMock = vi.fn(async () => streamResponse([`${JSON.stringify(DONE_EVENT)}\n`]));
    vi.stubGlobal("fetch", fetchMock);
    await askAiStreaming(INPUT, { onToken: () => {} });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/siga-ai/chat");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer t");
    expect(JSON.parse(String(init.body))).toMatchObject({ question: INPUT.question });
  });
});
