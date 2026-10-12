import { describe, expect, it } from "vitest";
import {
  applyRelevanceFloor,
  diversifyByDocument,
  rerankChunks,
  type RerankedChunk,
} from "@/features/siga-ai/rerank";
import {
  contextLimitsForModel,
  parseParameterSize,
  planContext,
} from "@/features/siga-ai/context-limits";
import { RERANK_QUALITY_GATE } from "@/features/siga-ai/nomad-params";

function chunk(partial: Partial<RerankedChunk> & { score: number }): RerankedChunk {
  return {
    text: "texto",
    keywords: "",
    documentId: "doc-1",
    documentTitle: "Documento",
    chunkIndex: 0,
    finalScore: partial.score,
    ...partial,
  };
}

describe("siga-ai reordenação", () => {
  it("não dá bónus abaixo da porta de qualidade", () => {
    const weak = chunk({
      score: RERANK_QUALITY_GATE - 0.01,
      text: "propina matrícula aluno",
      keywords: "propina",
    });
    const [result] = rerankChunks([weak], ["propina", "matrícula"], "propina matrícula");
    expect(result!.finalScore).toBe(weak.score);
  });

  it("promove o fragmento que partilha palavras-chave com a pergunta", () => {
    const relevant = chunk({
      score: 0.7,
      documentId: "a",
      text: "A propina mensal vence no dia 10 de cada mês.",
      keywords: "propina mensal vence",
    });
    const unrelated = chunk({ score: 0.72, documentId: "b", text: "Horário dos transportes." });
    const ranked = rerankChunks(
      [unrelated, relevant],
      ["propina", "vence"],
      "quando vence a propina",
    );
    expect(ranked[0]!.documentId).toBe("a");
  });

  it("o piso corta o que fica abaixo e conta o que cortou", () => {
    const stats = { candidates: 0, belowFloor: 0 };
    const kept = applyRelevanceFloor([chunk({ score: 0.8 }), chunk({ score: 0.4 })], 0.62, stats);
    expect(kept).toHaveLength(1);
    expect(stats).toEqual({ candidates: 2, belowFloor: 1 });
  });

  it("limita fragmentos do mesmo documento", () => {
    const many = [0.9, 0.8, 0.7, 0.6].map((score, index) =>
      chunk({ score, chunkIndex: index, documentId: "mesmo" }),
    );
    expect(diversifyByDocument(many)).toHaveLength(2);
  });
});

describe("siga-ai orçamento de contexto", () => {
  it("lê o tamanho do modelo do nome", () => {
    expect(parseParameterSize("llama3.2:3b")).toBe(3);
    expect(parseParameterSize("qwen2.5:7b-instruct-q4_K_M")).toBe(7);
    expect(parseParameterSize("modelo-sem-tamanho")).toBeNull();
  });

  it("aplica os tectos por tamanho de modelo do NOMAD", () => {
    expect(contextLimitsForModel("llama3.2:1b")).toEqual({ maxResults: 2, maxTokens: 1000 });
    expect(contextLimitsForModel("qwen2.5:7b")).toEqual({ maxResults: 4, maxTokens: 2500 });
    expect(contextLimitsForModel("llama3.3:70b").maxTokens).toBe(0);
    // Desconhecido: tecto mais largo, não o mais apertado — o NOMAD faz igual.
    expect(contextLimitsForModel("modelo-estranho").maxResults).toBe(5);
  });

  it("corta por número e por tokens, e guarda sempre pelo menos um fragmento", () => {
    const chunks = [0.9, 0.8, 0.7].map((score) => chunk({ score, text: "a".repeat(4000) }));
    const plan = planContext(chunks, { maxResults: 2, maxTokens: 1000 });
    expect(plan.chunks).toHaveLength(1);
    expect(plan.droppedByCount).toBe(1);
    expect(plan.droppedByTokens).toBe(1);
  });
});
