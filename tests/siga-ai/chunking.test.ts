import { describe, expect, it } from "vitest";
import {
  chunkText,
  estimateTokens,
  extractKeywords,
  normalizeQuery,
  toDocumentEmbeddingInput,
  toQueryEmbeddingInput,
  truncateToTokenLimit,
} from "@/features/siga-ai/chunking";
import {
  CHAR_TO_TOKEN_RATIO,
  MAX_SAFE_EMBED_TOKENS,
  SEARCH_DOCUMENT_PREFIX,
  SEARCH_QUERY_PREFIX,
} from "@/features/siga-ai/nomad-params";

describe("siga-ai chunking", () => {
  it("estima tokens pela razão conservadora do NOMAD", () => {
    expect(estimateTokens("a".repeat(100))).toBe(100 / CHAR_TO_TOKEN_RATIO);
  });

  it("nunca excede o contexto do embedder, com prefixo incluído", () => {
    const huge = "palavra ".repeat(5000);
    for (const input of [toDocumentEmbeddingInput(huge), toQueryEmbeddingInput(huge)]) {
      expect(estimateTokens(input)).toBeLessThanOrEqual(MAX_SAFE_EMBED_TOKENS);
    }
    expect(toDocumentEmbeddingInput("x").startsWith(SEARCH_DOCUMENT_PREFIX)).toBe(true);
    expect(toQueryEmbeddingInput("x").startsWith(SEARCH_QUERY_PREFIX)).toBe(true);
  });

  it("parte texto longo com sobreposição e sem perder conteúdo", () => {
    const paragraphs = Array.from(
      { length: 40 },
      (_, index) => `Parágrafo ${index}: regulamento interno da escola, artigo ${index}.`,
    ).join("\n\n");
    const chunks = chunkText(paragraphs, { targetTokens: 60, overlapTokens: 10 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.map((chunk) => chunk.index)).toEqual(chunks.map((_, index) => index));
    // Nenhum fragmento vazio, e o primeiro e o último parágrafo estão cobertos.
    expect(chunks.every((chunk) => chunk.text.trim().length > 0)).toBe(true);
    expect(chunks[0]!.text).toContain("Parágrafo 0");
    expect(chunks[chunks.length - 1]!.text).toContain("Parágrafo 39");
  });

  it("termina mesmo quando a sobreposição é maior do que o fragmento", () => {
    const chunks = chunkText("a".repeat(2000), { targetTokens: 10, overlapTokens: 1000 });
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.length).toBeLessThan(500);
  });

  it("devolve lista vazia para texto em branco", () => {
    expect(chunkText("   \n\n  ")).toEqual([]);
  });

  it("extrai palavras-chave sem palavras vazias portuguesas", () => {
    const keywords = extractKeywords(
      "A matrícula do aluno na escola depende do pagamento da propina",
    );
    expect(keywords).toContain("matrícula");
    expect(keywords).toContain("propina");
    expect(keywords).not.toContain("do");
    expect(keywords).not.toContain("na");
  });

  it("normaliza espaços e pontuação repetida", () => {
    expect(normalizeQuery("  o que   é  isto???? ")).toBe("o que é isto?");
  });

  it("truncar nunca devolve mais do que o limite", () => {
    expect(truncateToTokenLimit("a".repeat(100), 10).length).toBe(10 * CHAR_TO_TOKEN_RATIO);
  });
});
