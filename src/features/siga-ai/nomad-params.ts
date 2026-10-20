/**
 * Parâmetros de recuperação portados do Project NOMAD (Apache-2.0).
 *
 * Origem: https://github.com/Crosstalk-Solutions/project-nomad
 * Commit fixado: 54ee30a44902e5c252b477f8685c26ec3064ab72 (v1.35.1)
 * Ficheiros: `admin/constants/ollama.ts`, `admin/app/services/rag_service.ts`
 *
 * Porque é que isto é um ficheiro de constantes e não "o que parecer razoável":
 * o NOMAD calibrou estes números contra um conjunto dourado de 99 perguntas
 * (`node ace eval:retrieval`), e a tabela de calibração do piso de relevância
 * está reproduzida abaixo. Escolher outros valores por intuição seria perder
 * exactamente o trabalho que justifica reutilizar o NOMAD. Alterar um valor
 * aqui exige medição, não opinião.
 *
 * Ver `NOTICE` na raiz e `docs/agents/SIGA_AI_NOMAD_AUDIT.md` §3.
 */

/** Referência da versão auditada — citada no diagnóstico e na documentação. */
export const NOMAD_SOURCE = {
  repo: "Crosstalk-Solutions/project-nomad",
  commit: "54ee30a44902e5c252b477f8685c26ec3064ab72",
  version: "1.35.1",
  license: "Apache-2.0",
} as const;

/** `constants/ollama.ts:65`. Dimensão 768, prefixos de tarefa obrigatórios. */
export const EMBEDDING_MODEL = "nomic-embed-text:v1.5";

/** `rag_service.ts:86` — dimensão do nomic-embed-text v1.5. */
export const EMBEDDING_DIMENSION = 768;

/** `rag_service.ts:167` — métrica da colecção Qdrant. */
export const EMBEDDING_DISTANCE = "Cosine" as const;

/**
 * Prefixos de tarefa do nomic-embed-text v1.5 (`rag_service.ts`). Sem eles a
 * qualidade cai: o modelo foi treinado para distinguir documento de pergunta.
 */
export const SEARCH_DOCUMENT_PREFIX = "search_document: ";
export const SEARCH_QUERY_PREFIX = "search_query: ";

/** `rag_service.ts:85-92`. O embedder tem 2K de contexto; 1600 deixa margem. */
export const EMBEDDER_CONTEXT_TOKENS = 2048;
export const MAX_SAFE_EMBED_TOKENS = 1600;
export const TARGET_TOKENS_PER_CHUNK = 1500;
export const CHUNK_OVERLAP_TOKENS = 150;

/**
 * `rag_service.ts:92` — estimativa conservadora de caracteres por token.
 * Texto técnico (números, siglas, símbolos) tokeniza mais denso do que prosa
 * (~3), por isso 2 evita transbordos de contexto.
 */
export const CHAR_TO_TOKEN_RATIO = 2;

/** `rag_service.ts` — lote pequeno para hardware modesto. */
export const EMBEDDING_BATCH_SIZE = 8;

/** `constants/ollama.ts:100-101` — recuperação por omissão. */
export const RAG_DEFAULT_TOP_K = 5;
export const RAG_DEFAULT_SCORE_THRESHOLD = 0.3;

/** `rag_service.ts:1025` — candidatos pedidos ao Qdrant antes de reordenar. */
export const RERANK_CANDIDATE_MULTIPLIER = 3;

/**
 * `constants/ollama.ts:104-172` — piso aplicado ao score **pós-reordenação**.
 *
 * Calibração do original (99 goldens, impressão digital 51e642964facf251):
 *
 *     piso    recall@5   precision@5
 *     0.00      0.991        0.221
 *     0.62      0.991        0.524  ← escolhido: último valor com margem
 *     0.66      0.991        0.695
 *     0.67      0.972        0.704  ← recall já cai
 *     0.72      0.888        0.796
 *
 * 0.62 em vez de 0.66 por assimetria das falhas: um fragmento relevante
 * descartado é uma pergunta sem resposta; um irrelevante a mais é ruído que o
 * modelo ignora.
 */
export const RAG_MIN_FINAL_SCORE = 0.62;

/** `rag_service.ts:1185` — porta de qualidade: abaixo disto não há bónus. */
export const RERANK_QUALITY_GATE = 0.35;

/** `rag_service.ts:1199-1260` — tectos dos bónus, como fracção do score base. */
export const RERANK_KEYWORD_BOOST = 0.1;
export const RERANK_DIRECT_MATCH_BOOST = 0.075;
export const RERANK_HEADING_BOOST = 0.1;

/**
 * `constants/ollama.ts:88-95` — tectos de contexto por tamanho do modelo.
 * Modelos pequenos pioram com contexto a mais, não melhoram.
 */
export const RAG_CONTEXT_LIMITS: ReadonlyArray<{
  maxParams: number;
  maxResults: number;
  maxTokens: number;
}> = [
  { maxParams: 3, maxResults: 2, maxTokens: 1000 },
  { maxParams: 8, maxResults: 4, maxTokens: 2500 },
  { maxParams: Number.POSITIVE_INFINITY, maxResults: RAG_DEFAULT_TOP_K, maxTokens: 0 },
];

/**
 * `constants/ollama.ts:83` — chão da janela de contexto.
 *
 * O Ollama assume 4096 em máquinas com menos de 24 GB de VRAM e trunca em
 * silêncio o que passa disso: sem erro, sem aviso, o modelo simplesmente nunca
 * vê o início da conversa.
 */
export const DEFAULT_CONTEXT_LENGTH = 8192;

/** `constants/ollama.ts:281` — perfil de amostragem equilibrado ("auto"). */
export const SAMPLER_AUTO = {
  temperature: 0.6,
  topP: 1.0,
  topK: 40,
  minP: 0.05,
  repeatPenalty: 1.1,
} as const;
