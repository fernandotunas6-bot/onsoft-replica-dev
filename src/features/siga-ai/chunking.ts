/**
 * Fragmentação, estimativa de tokens e palavras-chave — lógica pura, testável
 * sem Ollama nem Qdrant.
 *
 * Portado de `admin/app/services/rag_service.ts` do Project NOMAD
 * (Apache-2.0, commit 54ee30a4…). Ver `nomad-params.ts` e `NOTICE`.
 */
import {
  CHAR_TO_TOKEN_RATIO,
  CHUNK_OVERLAP_TOKENS,
  MAX_SAFE_EMBED_TOKENS,
  SEARCH_DOCUMENT_PREFIX,
  SEARCH_QUERY_PREFIX,
  TARGET_TOKENS_PER_CHUNK,
} from "./nomad-params";

/** Estimativa conservadora: 1 token ≈ 2 caracteres (ver `CHAR_TO_TOKEN_RATIO`). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHAR_TO_TOKEN_RATIO);
}

/** Corta o texto para caber num limite de tokens (estimado). */
export function truncateToTokenLimit(text: string, maxTokens: number): string {
  const maxChars = Math.max(0, maxTokens) * CHAR_TO_TOKEN_RATIO;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars);
}

/** Texto a embeber como documento, já com prefixo de tarefa e dentro do limite. */
export function toDocumentEmbeddingInput(text: string): string {
  const budget = MAX_SAFE_EMBED_TOKENS - estimateTokens(SEARCH_DOCUMENT_PREFIX);
  return SEARCH_DOCUMENT_PREFIX + truncateToTokenLimit(text, budget);
}

/** Texto a embeber como pergunta, já com prefixo de tarefa e dentro do limite. */
export function toQueryEmbeddingInput(query: string): string {
  const budget = MAX_SAFE_EMBED_TOKENS - estimateTokens(SEARCH_QUERY_PREFIX);
  return SEARCH_QUERY_PREFIX + truncateToTokenLimit(normalizeQuery(query), budget);
}

export type TextChunk = { index: number; text: string; keywords: string };

/**
 * Parte o texto em fragmentos de ~1500 tokens com 150 de sobreposição,
 * preferindo cortar em fim de frase ou de parágrafo para não partir uma ideia
 * ao meio. A sobreposição existe para que uma resposta a cavalo de dois
 * fragmentos continue inteira em pelo menos um deles.
 */
export function chunkText(
  raw: string,
  options: { targetTokens?: number; overlapTokens?: number } = {},
): TextChunk[] {
  const text = raw
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
  if (!text) return [];

  const targetChars = (options.targetTokens ?? TARGET_TOKENS_PER_CHUNK) * CHAR_TO_TOKEN_RATIO;
  const overlapChars = Math.min(
    (options.overlapTokens ?? CHUNK_OVERLAP_TOKENS) * CHAR_TO_TOKEN_RATIO,
    Math.floor(targetChars / 2),
  );

  const chunks: TextChunk[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const hardEnd = Math.min(cursor + targetChars, text.length);
    let end = hardEnd;
    if (hardEnd < text.length) {
      // Procurar um corte natural no último terço do fragmento.
      const window = text.slice(cursor, hardEnd);
      const floor = Math.floor(targetChars * 0.6);
      const breakAt = Math.max(
        window.lastIndexOf("\n\n"),
        window.lastIndexOf(". "),
        window.lastIndexOf("! "),
        window.lastIndexOf("? "),
        window.lastIndexOf("\n"),
      );
      if (breakAt > floor) end = cursor + breakAt + 1;
    }
    const piece = text.slice(cursor, end).trim();
    if (piece) chunks.push({ index: chunks.length, text: piece, keywords: "" });
    if (end >= text.length) break;
    // Avançar sempre, mesmo que a sobreposição fosse maior do que o fragmento.
    cursor = Math.max(end - overlapChars, cursor + 1);
  }

  return chunks.map((chunk) => ({ ...chunk, keywords: extractKeywords(chunk.text).join(" ") }));
}

/** Palavras vazias do português de Angola (e algumas inglesas, comuns em manuais). */
const STOP_WORDS = new Set([
  "a",
  "à",
  "ao",
  "aos",
  "as",
  "às",
  "com",
  "como",
  "da",
  "das",
  "de",
  "do",
  "dos",
  "e",
  "em",
  "entre",
  "era",
  "essa",
  "esse",
  "esta",
  "está",
  "estão",
  "este",
  "eu",
  "foi",
  "for",
  "foram",
  "há",
  "isso",
  "isto",
  "já",
  "la",
  "lhe",
  "lo",
  "mais",
  "mas",
  "me",
  "mesmo",
  "meu",
  "minha",
  "muito",
  "na",
  "não",
  "nas",
  "nem",
  "no",
  "nos",
  "nós",
  "num",
  "numa",
  "o",
  "os",
  "ou",
  "para",
  "pela",
  "pelas",
  "pelo",
  "pelos",
  "por",
  "qual",
  "quando",
  "que",
  "quem",
  "se",
  "sem",
  "ser",
  "seu",
  "sua",
  "são",
  "só",
  "tem",
  "também",
  "te",
  "tu",
  "um",
  "uma",
  "umas",
  "uns",
  "vai",
  "você",
  "vos",
  "and",
  "are",
  "for",
  "from",
  "has",
  "have",
  "how",
  "its",
  "not",
  "that",
  "the",
  "this",
  "was",
  "were",
  "what",
  "when",
  "where",
  "which",
  "who",
  "with",
  "you",
  "your",
]);

/**
 * Palavras-chave de um texto: tokens com mais de três letras, sem palavras
 * vazias, por ordem de frequência. Alimenta o bónus de reordenação.
 */
export function extractKeywords(text: string, limit = 20): string[] {
  const counts = new Map<string, number>();
  for (const word of text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}-]{2,}/gu) ?? []) {
    if (STOP_WORDS.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([word]) => word);
}

/** Normaliza espaços e remove ruído de pontuação repetida antes de embeber. */
export function normalizeQuery(query: string): string {
  return query
    .replace(/\s+/g, " ")
    .replace(/([!?.])\1{2,}/g, "$1")
    .trim();
}
