/**
 * Orçamento de contexto: quantos fragmentos e quantos tokens é que este modelo
 * aguenta. Portado de `getContextLimitsForModel` + `planPrompt` do Project
 * NOMAD (Apache-2.0, commit 54ee30a4…), simplificado para o que o SIGA usa.
 */
import { estimateTokens } from "./chunking";
import { RAG_CONTEXT_LIMITS } from "./nomad-params";
import type { RerankedChunk } from "./rerank";

export type ContextLimits = { maxResults: number; maxTokens: number };

/**
 * Extrai o número de parâmetros do nome do modelo (`llama3.2:3b` → 3,
 * `qwen2.5:7b-instruct` → 7). Devolve `null` quando não dá para saber — e aí
 * assume-se o tecto mais largo, como no original.
 */
export function parseParameterSize(model: string): number | null {
  const match = model.toLowerCase().match(/(\d+(?:[.,]\d+)?)\s*b(?![a-z0-9])/);
  if (!match) return null;
  const value = Number.parseFloat(match[1]!.replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

export function contextLimitsForModel(model: string, parameterSize?: number | null): ContextLimits {
  const size = parameterSize ?? parseParameterSize(model);
  if (size === null) {
    const last = RAG_CONTEXT_LIMITS[RAG_CONTEXT_LIMITS.length - 1]!;
    return { maxResults: last.maxResults, maxTokens: last.maxTokens };
  }
  const tier =
    RAG_CONTEXT_LIMITS.find((limit) => size <= limit.maxParams) ??
    RAG_CONTEXT_LIMITS[RAG_CONTEXT_LIMITS.length - 1]!;
  return { maxResults: tier.maxResults, maxTokens: tier.maxTokens };
}

export type ContextPlan = {
  chunks: RerankedChunk[];
  droppedByCount: number;
  droppedByTokens: number;
  estimatedTokens: number;
};

/**
 * Decide o que cabe: primeiro o tecto por tamanho de modelo (quantos
 * fragmentos), depois o tecto de tokens (quanto texto). `maxTokens: 0`
 * significa sem limite de tokens, como no NOMAD para modelos de 13B ou mais.
 */
export function planContext(chunks: RerankedChunk[], limits: ContextLimits): ContextPlan {
  const byCount = chunks.slice(0, limits.maxResults);
  const droppedByCount = chunks.length - byCount.length;
  if (limits.maxTokens <= 0) {
    return {
      chunks: byCount,
      droppedByCount,
      droppedByTokens: 0,
      estimatedTokens: byCount.reduce((total, chunk) => total + estimateTokens(chunk.text), 0),
    };
  }

  const kept: RerankedChunk[] = [];
  let used = 0;
  for (const chunk of byCount) {
    const cost = estimateTokens(chunk.text);
    if (used + cost > limits.maxTokens && kept.length > 0) break;
    kept.push(chunk);
    used += cost;
  }
  return {
    chunks: kept,
    droppedByCount,
    droppedByTokens: byCount.length - kept.length,
    estimatedTokens: used,
  };
}
