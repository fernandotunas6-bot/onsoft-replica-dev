/**
 * Reordenação híbrida e piso de relevância — lógica pura.
 *
 * Portado de `rerankResults` em `admin/app/services/rag_service.ts`
 * (Project NOMAD, Apache-2.0, commit 54ee30a4…). A forma dos bónus é a do
 * original e a razão é a mesma: só se dá bónus a resultados que já são
 * plausíveis (porta de qualidade), e o bónus é proporcional ao score base com
 * retornos decrescentes (raiz quadrada), para que uma coincidência de palavras
 * nunca promova um fragmento fraco.
 */
import {
  RERANK_DIRECT_MATCH_BOOST,
  RERANK_HEADING_BOOST,
  RERANK_KEYWORD_BOOST,
  RERANK_QUALITY_GATE,
} from "./nomad-params";

export type RetrievedChunk = {
  text: string;
  score: number;
  keywords: string;
  documentId: string;
  documentTitle: string;
  chunkIndex: number;
  heading?: string;
};

export type RerankedChunk = RetrievedChunk & { finalScore: number };

export function rerankChunks(
  results: RetrievedChunk[],
  queryKeywords: string[],
  originalQuery: string,
): RerankedChunk[] {
  const queryTerms = originalQuery
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 3);

  return results
    .map((result): RerankedChunk => {
      // Porta de qualidade: um score semântico fraco fica como está. Sem isto,
      // repetir as palavras da pergunta num documento irrelevante bastava para
      // o promover.
      if (result.score < RERANK_QUALITY_GATE) return { ...result, finalScore: result.score };

      const lowerText = result.text.toLowerCase();
      const docKeywords = result.keywords.toLowerCase().split(" ").filter(Boolean);
      let finalScore = result.score;

      const matching = queryKeywords.filter(
        (keyword) =>
          docKeywords.includes(keyword.toLowerCase()) || lowerText.includes(keyword.toLowerCase()),
      );
      const keywordOverlap = matching.length / Math.max(queryKeywords.length, 1);
      if (keywordOverlap > 0) {
        finalScore += Math.sqrt(keywordOverlap) * RERANK_KEYWORD_BOOST * result.score;
      }

      if (queryTerms.length > 0) {
        const direct = queryTerms.filter((term) => lowerText.includes(term)).length;
        if (direct > 0) {
          const ratio = direct / queryTerms.length;
          finalScore += Math.sqrt(ratio) * RERANK_DIRECT_MATCH_BOOST * result.score;
        }
      }

      // Um termo da pergunta no título da secção é sinal forte: o texto do
      // corpo pode falar de outra coisa, o cabeçalho diz do que é o fragmento.
      const heading = (result.heading ?? "").toLowerCase();
      if (heading) {
        const hits = queryKeywords.filter((keyword) =>
          heading.includes(keyword.toLowerCase()),
        ).length;
        if (hits > 0) {
          const ratio = hits / Math.max(queryKeywords.length, 1);
          finalScore += Math.sqrt(ratio) * RERANK_HEADING_BOOST * result.score;
        }
      }

      return { ...result, finalScore };
    })
    .sort((a, b) => b.finalScore - a.finalScore);
}

export type FloorStats = { candidates: number; belowFloor: number };

/**
 * Aplica o piso de relevância depois da reordenação, onde o score significa
 * mais. Quando nada passa, devolve lista vazia — e o gateway responde sem
 * bloco de contexto, em vez de injectar ruído.
 */
export function applyRelevanceFloor(
  results: RerankedChunk[],
  minFinalScore: number,
  stats?: FloorStats,
): RerankedChunk[] {
  if (stats) {
    stats.candidates = results.length;
    stats.belowFloor = results.filter((result) => result.finalScore < minFinalScore).length;
  }
  if (minFinalScore <= 0) return results;
  return results.filter((result) => result.finalScore >= minFinalScore);
}

/**
 * Diversidade por documento: no máximo dois fragmentos do mesmo documento,
 * para que uma base com um manual muito grande não afogue os restantes.
 */
export function diversifyByDocument(results: RerankedChunk[], maxPerDocument = 2): RerankedChunk[] {
  const seen = new Map<string, number>();
  const kept: RerankedChunk[] = [];
  for (const result of results) {
    const count = seen.get(result.documentId) ?? 0;
    if (count >= maxPerDocument) continue;
    seen.set(result.documentId, count + 1);
    kept.push(result);
  }
  return kept;
}
