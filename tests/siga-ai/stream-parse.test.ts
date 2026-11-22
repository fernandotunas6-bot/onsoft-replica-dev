import { describe, expect, it } from "vitest";
import {
  encodeGatewayEvent,
  parseGatewayEvent,
  parseOllamaLine,
  parseSseLine,
  splitLines,
} from "@/features/siga-ai/stream-parse";

describe("siga-ai leitura de streaming", () => {
  it("guarda a linha incompleta para o pedaço seguinte", () => {
    const first = splitLines('{"a":1}\n{"b":2}\n{"c"');
    expect(first.lines).toEqual(['{"a":1}', '{"b":2}']);
    expect(first.rest).toBe('{"c"');
    // O resto junta-se ao pedaço seguinte e a linha fecha.
    expect(splitLines(`${first.rest}:3}\n`).lines).toEqual(['{"c":3}']);
  });

  it("aceita terminações \\r\\n e ignora linhas vazias", () => {
    expect(splitLines('{"a":1}\r\n\r\n{"b":2}\r\n').lines).toEqual(['{"a":1}', '{"b":2}']);
  });

  it("lê o conteúdo incremental do Ollama", () => {
    expect(parseOllamaLine('{"message":{"content":"Olá"},"done":false}')).toEqual({
      text: "Olá",
      done: false,
    });
    expect(parseOllamaLine('{"message":{"content":""},"done":true}')).toEqual({
      text: "",
      done: true,
    });
    // `/api/generate` usa `response` em vez de `message.content`.
    expect(parseOllamaLine('{"response":"x","done":false}')?.text).toBe("x");
  });

  it("ignora uma linha truncada em vez de rebentar a resposta", () => {
    expect(parseOllamaLine('{"message":{"content":"a"')).toBeNull();
    expect(parseOllamaLine("")).toBeNull();
  });

  it("propaga o erro que o próprio Ollama manda no stream", () => {
    expect(() => parseOllamaLine('{"error":"model not found"}')).toThrow(/model not found/);
  });

  it("lê os deltas do SSE compatível com OpenAI", () => {
    expect(parseSseLine('data: {"choices":[{"delta":{"content":"Bom"}}]}')).toEqual({
      text: "Bom",
      done: false,
    });
    expect(parseSseLine("data: [DONE]")).toEqual({ text: "", done: true });
    expect(parseSseLine('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}')?.done).toBe(
      true,
    );
    expect(parseSseLine(": keep-alive")).toBeNull();
  });

  it("codifica e lê os eventos do gateway em ida e volta", () => {
    const done = {
      type: "done" as const,
      conversationId: "c1",
      citations: [],
      model: "qwen2.5:7b",
      usedKnowledgeBase: false,
    };
    for (const event of [{ type: "token" as const, text: "a" }, done]) {
      const line = encodeGatewayEvent(event);
      expect(line.endsWith("\n")).toBe(true);
      expect(parseGatewayEvent(line.trim())).toEqual(event);
    }
  });

  it("recusa linhas que não são eventos conhecidos", () => {
    expect(parseGatewayEvent("não é json")).toBeNull();
    expect(parseGatewayEvent('{"type":"outra"}')).toBeNull();
    // Um erro sem mensagem continua a ser um erro legível.
    expect(parseGatewayEvent('{"type":"error"}')).toEqual({
      type: "error",
      message: "Erro na IA.",
    });
  });
});
