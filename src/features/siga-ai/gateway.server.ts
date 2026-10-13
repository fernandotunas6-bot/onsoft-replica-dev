/**
 * SIGA AI Gateway — a única porta entre o SIGA Plus e os serviços de IA.
 *
 * Responsabilidades (§3 do pedido):
 *  - resolver a escola activa pela membership (nunca pelo que o cliente diz);
 *  - decidir o modo de funcionamento e o endpoint;
 *  - aplicar permissões por perfil e limites de utilização;
 *  - recuperar só documentos autorizados da escola e montar o prompt;
 *  - registar utilização e auditoria;
 *  - devolver indisponibilidade como **estado**, não como excepção que rebenta
 *    noutro módulo.
 *
 * Nada aqui corre no browser: as tabelas `siga_ai_*` são só-servidor
 * (FORCE RLS, sem políticas) e os URL dos serviços nunca saem daqui.
 */
import { randomUUID } from "node:crypto";
import { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { recordAccessAudit } from "@/features/audit/record-audit";
import { checkRateLimit, isRateLimitBypassed, recordRateLimitAttempt } from "@/lib/rate-limit";
import type { SgaMembershipContext } from "@/integrations/supabase/sga";
import {
  AiEndpointError,
  resolveAiEndpoints,
  type AiSettingsRow,
  type ResolvedAiEndpoints,
} from "@/lib/siga-ai/endpoint-resolver.server";
import {
  AiServiceError,
  chat,
  chatStream,
  embed,
  embedBatched,
  listModels,
  type ChatMessage,
} from "@/lib/siga-ai/ollama-client.server";
import {
  deleteDocument as deleteVectorDocument,
  ensureCollection,
  health as vectorHealth,
  search as vectorSearch,
  upsertPoints,
  type KbPoint,
} from "@/lib/siga-ai/qdrant-client.server";
import {
  chunkText,
  extractKeywords,
  normalizeQuery,
  toDocumentEmbeddingInput,
  toQueryEmbeddingInput,
} from "./chunking";
import { contextLimitsForModel, planContext } from "./context-limits";
import {
  EMBEDDING_MODEL,
  RAG_DEFAULT_SCORE_THRESHOLD,
  RAG_DEFAULT_TOP_K,
  RAG_MIN_FINAL_SCORE,
  RERANK_CANDIDATE_MULTIPLIER,
} from "./nomad-params";
import {
  buildContextBlock,
  deriveConversationTitle,
  ragContextPrompt,
  systemPromptFor,
  type AiProfile,
} from "./prompts";
import {
  applyRelevanceFloor,
  diversifyByDocument,
  rerankChunks,
  type RerankedChunk,
} from "./rerank";
import type { GatewayEvent } from "./stream-parse";
import type {
  AiDocumentScope,
  AskAiInput,
  IngestDocumentInput,
  UpdateAiSettingsInput,
} from "./schemas";
import { MAX_DOCUMENT_CHUNKS } from "./schemas";

// Tabelas novas (migração 20261012160000): lidas sem o tipo gerado, como as web_*.
type LooseDb = { from: (table: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
type Row = Record<string, unknown>;

async function db(): Promise<LooseDb> {
  return (await loadSgaAdminClient()) as unknown as LooseDb;
}

const str = (value: unknown) => (typeof value === "string" ? value : null);

// ---------------------------------------------------------------------------
// Configuração por escola

const DEFAULT_SETTINGS: Omit<AiSettingsRow, never> & {
  allowed_profiles: AiProfile[];
  hourly_limit: number;
  retention_days: number;
} = {
  enabled: false,
  mode: "local",
  endpoint_url: null,
  vector_url: null,
  chat_model: null,
  remote_allowed: false,
  allowed_profiles: ["professor", "aluno", "secretaria", "administrador"],
  hourly_limit: 40,
  retention_days: 365,
};

export type AiSettings = typeof DEFAULT_SETTINGS;

function toSettings(row: Row | null): AiSettings {
  if (!row) return { ...DEFAULT_SETTINGS };
  const profiles = Array.isArray(row["allowed_profiles"])
    ? (row["allowed_profiles"] as string[]).filter((value): value is AiProfile =>
        DEFAULT_SETTINGS.allowed_profiles.includes(value as AiProfile),
      )
    : DEFAULT_SETTINGS.allowed_profiles;
  return {
    enabled: row["enabled"] === true,
    mode: (str(row["mode"]) as AiSettings["mode"]) ?? "local",
    endpoint_url: str(row["endpoint_url"]),
    vector_url: str(row["vector_url"]),
    chat_model: str(row["chat_model"]),
    remote_allowed: row["remote_allowed"] === true,
    allowed_profiles: profiles.length ? profiles : DEFAULT_SETTINGS.allowed_profiles,
    hourly_limit:
      typeof row["hourly_limit"] === "number" ? row["hourly_limit"] : DEFAULT_SETTINGS.hourly_limit,
    retention_days:
      typeof row["retention_days"] === "number"
        ? row["retention_days"]
        : DEFAULT_SETTINGS.retention_days,
  };
}

/**
 * Lê a configuração da escola. Tabela ausente (SQL por aplicar) = IA desligada,
 * como qualquer outro módulo premium ainda não provisionado.
 */
export async function loadAiSettings(schoolId: string): Promise<AiSettings> {
  const { data, error } = await (
    await db()
  )
    .from("siga_ai_settings")
    .select("*")
    .eq("school_id", schoolId)
    .maybeSingle();
  if (error) {
    if (isMissingRelation(error)) return { ...DEFAULT_SETTINGS };
    throw new Error("Não foi possível ler a configuração do SIGA AI.");
  }
  return toSettings((data ?? null) as Row | null);
}

function isMissingRelation(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /relation .* does not exist|could not find the table/i.test(error.message ?? "")
  );
}

export async function saveAiSettings(
  membership: SgaMembershipContext,
  actorUserId: string,
  input: UpdateAiSettingsInput,
): Promise<AiSettings> {
  const current = await loadAiSettings(membership.schoolId);
  const next: AiSettings = {
    ...current,
    ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
    ...(input.mode !== undefined ? { mode: input.mode } : {}),
    ...(input.endpointUrl !== undefined ? { endpoint_url: input.endpointUrl || null } : {}),
    ...(input.vectorUrl !== undefined ? { vector_url: input.vectorUrl || null } : {}),
    ...(input.chatModel !== undefined ? { chat_model: input.chatModel || null } : {}),
    ...(input.remoteAllowed !== undefined ? { remote_allowed: input.remoteAllowed } : {}),
    ...(input.allowedProfiles !== undefined && input.allowedProfiles.length
      ? { allowed_profiles: input.allowedProfiles }
      : {}),
    ...(input.hourlyLimit !== undefined ? { hourly_limit: input.hourlyLimit } : {}),
    ...(input.retentionDays !== undefined ? { retention_days: input.retentionDays } : {}),
  };

  // Validar os endereços antes de gravar: um endpoint inválido gravado é um
  // módulo que só falha na primeira pergunta de um professor.
  resolveAiEndpointsOrNull(next);

  const { error } = await (await db()).from("siga_ai_settings").upsert(
    {
      school_id: membership.schoolId,
      enabled: next.enabled,
      mode: next.mode,
      endpoint_url: next.endpoint_url,
      vector_url: next.vector_url,
      chat_model: next.chat_model,
      remote_allowed: next.remote_allowed,
      allowed_profiles: next.allowed_profiles,
      hourly_limit: next.hourly_limit,
      retention_days: next.retention_days,
      updated_by: actorUserId,
    },
    { onConflict: "school_id" },
  );
  if (error) throw new Error("Não foi possível guardar a configuração do SIGA AI.");

  await recordAccessAudit({
    schoolId: membership.schoolId,
    actorUserId,
    action: "siga_ai.settings.update",
    entityType: "siga_ai_settings",
    entityId: membership.schoolId,
    metadata: {
      enabled: next.enabled,
      mode: next.mode,
      remote_allowed: next.remote_allowed,
      allowed_profiles: next.allowed_profiles,
    },
  });
  return next;
}

/** Resolve os endpoints e devolve `null` em vez de rebentar (para o estado). */
function resolveAiEndpointsOrNull(settings: AiSettings): ResolvedAiEndpoints | null {
  try {
    return resolveAiEndpoints(settings);
  } catch (error) {
    if (error instanceof AiEndpointError) return null;
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Estado e diagnóstico

export type AiStatus = {
  enabled: boolean;
  mode: AiSettings["mode"];
  /** Indicador principal mostrado na interface. */
  state: "available" | "model_missing" | "unreachable" | "disabled" | "not_configured";
  message: string;
  models: string[];
  chatModel: string | null;
  knowledgeBase: "ready" | "unavailable" | "not_configured";
  embeddingModel: string;
  profile: AiProfile;
  profileAllowed: boolean;
};

export function profileForRole(appRole: string): AiProfile {
  if (appRole === "Professor") return "professor";
  if (appRole === "Aluno" || appRole === "Encarregado") return "aluno";
  if (appRole === "Administrador") return "administrador";
  return "secretaria";
}

export async function getAiStatus(membership: SgaMembershipContext): Promise<AiStatus> {
  const settings = await loadAiSettings(membership.schoolId);
  const profile = profileForRole(membership.appRole);
  const base: AiStatus = {
    enabled: settings.enabled,
    mode: settings.mode,
    state: "disabled",
    message: "O SIGA AI não está activado nesta escola.",
    models: [],
    chatModel: settings.chat_model,
    knowledgeBase: "not_configured",
    embeddingModel: EMBEDDING_MODEL,
    profile,
    profileAllowed: settings.allowed_profiles.includes(profile),
  };
  if (!settings.enabled) return base;

  const endpoints = resolveAiEndpointsOrNull(settings);
  if (!endpoints) {
    return {
      ...base,
      state: "not_configured",
      message: "Falta indicar o endereço do serviço de IA (ou o modo remoto não está autorizado).",
    };
  }

  try {
    const models = await listModels(endpoints.chatBaseUrl);
    const names = models.map((model) => model.name);
    const chatModel = endpoints.chatModel ?? names.find((name) => !name.includes("embed")) ?? null;
    const hasEmbedder = names.some((name) => name.startsWith("nomic-embed-text"));
    const kb = endpoints.vectorBaseUrl
      ? (await vectorHealth(endpoints.vectorBaseUrl)) && hasEmbedder
        ? "ready"
        : "unavailable"
      : "not_configured";
    if (!chatModel) {
      return {
        ...base,
        models: names,
        chatModel: null,
        knowledgeBase: kb,
        state: "model_missing",
        message: "O serviço responde, mas não tem nenhum modelo de conversa instalado.",
      };
    }
    return {
      ...base,
      models: names,
      chatModel,
      knowledgeBase: kb,
      state: "available",
      message:
        kb === "ready"
          ? "IA disponível, com pesquisa documental."
          : "IA disponível. Pesquisa documental indisponível.",
    };
  } catch (error) {
    const code = error instanceof AiServiceError ? error.code : "unreachable";
    return {
      ...base,
      state: code === "model_missing" ? "model_missing" : "unreachable",
      message:
        error instanceof AiServiceError
          ? error.message
          : "Não foi possível contactar o serviço de IA.",
    };
  }
}

// ---------------------------------------------------------------------------
// Limites de utilização

function assertUsageLimit(userId: string, hourlyLimit: number) {
  const key = `siga_ai:${userId}`;
  if (isRateLimitBypassed(key)) return;
  const options = { windowMs: 60 * 60 * 1000, max: hourlyLimit };
  if (!checkRateLimit([key], options)) {
    throw new Error("Atingiu o limite de perguntas à IA nesta hora. Tente mais tarde.");
  }
  recordRateLimitAttempt([key], options);
}

// ---------------------------------------------------------------------------
// Recuperação documental

export type Citation = {
  documentId: string;
  documentTitle: string;
  chunkIndex: number;
  score: number;
  excerpt: string;
};

async function retrieveContext(
  endpoints: ResolvedAiEndpoints,
  schoolId: string,
  userId: string,
  question: string,
  model: string,
): Promise<{ chunks: RerankedChunk[]; citations: Citation[] }> {
  if (!endpoints.vectorBaseUrl) return { chunks: [], citations: [] };

  const [queryVector] = await embed(endpoints.chatBaseUrl, EMBEDDING_MODEL, [
    toQueryEmbeddingInput(question),
  ]);
  if (!queryVector) return { chunks: [], citations: [] };

  const hits = await vectorSearch(endpoints.vectorBaseUrl, queryVector, {
    schoolId,
    userId,
    limit: RAG_DEFAULT_TOP_K * RERANK_CANDIDATE_MULTIPLIER,
    scoreThreshold: RAG_DEFAULT_SCORE_THRESHOLD,
  });

  const candidates: RerankedChunk[] = hits.map((hit) => ({
    text: String(hit.payload.text ?? ""),
    score: hit.score,
    keywords: String(hit.payload.keywords ?? ""),
    documentId: String(hit.payload.document_id ?? ""),
    documentTitle: String(hit.payload.document_title ?? "Documento"),
    chunkIndex: Number(hit.payload.chunk_index ?? 0),
    ...(hit.payload.heading ? { heading: String(hit.payload.heading) } : {}),
    finalScore: hit.score,
  }));

  const normalized = normalizeQuery(question);
  const reranked = rerankChunks(candidates, extractKeywords(normalized, 12), normalized);
  const floored = applyRelevanceFloor(reranked, RAG_MIN_FINAL_SCORE);
  const diverse = diversifyByDocument(floored);
  const plan = planContext(diverse, contextLimitsForModel(model));

  return {
    chunks: plan.chunks,
    citations: plan.chunks.map((chunk) => ({
      documentId: chunk.documentId,
      documentTitle: chunk.documentTitle,
      chunkIndex: chunk.chunkIndex,
      score: Number(chunk.finalScore.toFixed(3)),
      excerpt: chunk.text.slice(0, 280),
    })),
  };
}

// ---------------------------------------------------------------------------
// Perguntar

export type AskResult = {
  conversationId: string;
  answer: string;
  citations: Citation[];
  model: string;
  mode: AiSettings["mode"];
  usedKnowledgeBase: boolean;
};

/**
 * Tudo o que uma pergunta precisa antes de falar com o modelo: permissões,
 * limites, modelo escolhido, histórico e contexto documental.
 *
 * Existe separado para que a resposta completa (`askAi`) e a resposta token a
 * token (`askAiStream`) não possam divergir em permissões ou em isolamento —
 * era o tipo de duplicação em que uma das duas acaba sem uma verificação.
 */
async function prepareAsk(
  membership: SgaMembershipContext,
  userId: string,
  input: AskAiInput,
  signal?: AbortSignal,
): Promise<{
  settings: AiSettings;
  endpoints: ResolvedAiEndpoints;
  model: string;
  messages: ChatMessage[];
  citations: Citation[];
  usedKnowledgeBase: boolean;
  profile: AiProfile;
}> {
  const settings = await loadAiSettings(membership.schoolId);
  if (!settings.enabled) throw new Error("O SIGA AI não está activado nesta escola.");

  const profile = profileForRole(membership.appRole);
  if (!settings.allowed_profiles.includes(profile)) {
    throw new Error("O seu perfil não tem acesso ao assistente nesta escola.");
  }
  assertUsageLimit(userId, settings.hourly_limit);

  const endpoints = resolveAiEndpoints(settings);
  const models = await listModels(endpoints.chatBaseUrl, signal);
  const names = models.map((model) => model.name);
  // Um modelo pedido pelo cliente só é aceite se estiver instalado: senão é um
  // nome arbitrário a chegar ao motor de inferência.
  const requested = input.model && names.includes(input.model) ? input.model : null;
  const model =
    requested ?? endpoints.chatModel ?? names.find((name) => !name.includes("embed")) ?? null;
  if (!model) {
    throw new AiServiceError(
      "Nenhum modelo de conversa instalado no servidor de IA.",
      "model_missing",
    );
  }

  const history = input.conversationId
    ? await loadConversationMessages(membership.schoolId, userId, input.conversationId)
    : [];

  let citations: Citation[] = [];
  let contextPrompt: string | null = null;
  if (input.useKnowledgeBase) {
    try {
      const retrieved = await retrieveContext(
        endpoints,
        membership.schoolId,
        userId,
        input.question,
        model,
      );
      citations = retrieved.citations;
      if (retrieved.chunks.length) {
        contextPrompt = ragContextPrompt(buildContextBlock(retrieved.chunks));
      }
    } catch (error) {
      // A base documental em baixo não impede responder: degrada para conversa
      // sem contexto, que é o comportamento que a escola espera.
      console.error("[siga-ai] recuperação documental indisponível:", error);
    }
  }

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: systemPromptFor(input.profile ?? profile, membership.schoolName ?? null),
    },
    ...(contextPrompt ? [{ role: "system" as const, content: contextPrompt }] : []),
    ...history,
    { role: "user", content: input.question },
  ];

  return {
    settings,
    endpoints,
    model,
    messages,
    citations,
    usedKnowledgeBase: Boolean(contextPrompt),
    profile,
  };
}

export async function askAi(
  membership: SgaMembershipContext,
  userId: string,
  input: AskAiInput,
  signal?: AbortSignal,
): Promise<AskResult> {
  const prepared = await prepareAsk(membership, userId, input, signal);
  const started = Date.now();
  const answer = await chat(prepared.endpoints.chatBaseUrl, prepared.model, prepared.messages, {
    signal,
  });
  const elapsed = Date.now() - started;

  const conversationId = await persistTurn({
    schoolId: membership.schoolId,
    userId,
    conversationId: input.conversationId ?? null,
    question: input.question,
    answer,
    model: prepared.model,
    citations: prepared.citations,
    profile: prepared.profile,
  });

  await recordUsage({
    schoolId: membership.schoolId,
    userId,
    model: prepared.model,
    mode: prepared.settings.mode,
    elapsedMs: elapsed,
    questionChars: input.question.length,
    answerChars: answer.length,
    citations: prepared.citations.length,
  });

  return {
    conversationId,
    answer,
    citations: prepared.citations,
    model: prepared.model,
    mode: prepared.settings.mode,
    usedKnowledgeBase: prepared.usedKnowledgeBase,
  };
}

/**
 * A mesma pergunta, token a token.
 *
 * Emite os eventos do protocolo do gateway e, no fim, grava o turno — mas só
 * se a resposta tiver chegado completa. Uma geração cancelada a meio não deixa
 * meia resposta gravada como se fosse a resposta da IA; o que o utilizador viu
 * no ecrã fica no ecrã, e a conversa guardada continua coerente.
 */
export async function* askAiStream(
  membership: SgaMembershipContext,
  userId: string,
  input: AskAiInput,
  signal?: AbortSignal,
): AsyncGenerator<GatewayEvent, void, undefined> {
  const prepared = await prepareAsk(membership, userId, input, signal);
  const started = Date.now();
  let answer = "";

  for await (const delta of chatStream(
    prepared.endpoints.chatBaseUrl,
    prepared.model,
    prepared.messages,
    { signal },
  )) {
    answer += delta;
    yield { type: "token", text: delta };
  }

  if (signal?.aborted) return;
  if (!answer.trim()) {
    throw new AiServiceError("O modelo devolveu uma resposta vazia.", "bad_response");
  }

  const conversationId = await persistTurn({
    schoolId: membership.schoolId,
    userId,
    conversationId: input.conversationId ?? null,
    question: input.question,
    answer,
    model: prepared.model,
    citations: prepared.citations,
    profile: prepared.profile,
  });

  await recordUsage({
    schoolId: membership.schoolId,
    userId,
    model: prepared.model,
    mode: prepared.settings.mode,
    elapsedMs: Date.now() - started,
    questionChars: input.question.length,
    answerChars: answer.length,
    citations: prepared.citations.length,
  });

  yield {
    type: "done",
    conversationId,
    citations: prepared.citations,
    model: prepared.model,
    usedKnowledgeBase: prepared.usedKnowledgeBase,
  };
}

// ---------------------------------------------------------------------------
// Conversas

/** Últimos turnos da conversa, para dar continuidade sem estourar o contexto. */
const HISTORY_TURNS = 8;

async function loadConversationMessages(
  schoolId: string,
  userId: string,
  conversationId: string,
): Promise<ChatMessage[]> {
  const client = await db();
  const { data: conversation } = await client
    .from("siga_ai_conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("school_id", schoolId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!conversation) return [];
  const { data } = await client
    .from("siga_ai_messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .eq("school_id", schoolId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_TURNS * 2);
  return ((data ?? []) as Row[])
    .reverse()
    .map((row) => ({
      role: (str(row["role"]) === "assistant" ? "assistant" : "user") as "assistant" | "user",
      content: String(row["content"] ?? ""),
    }))
    .filter((message) => message.content.trim().length > 0);
}

async function persistTurn(args: {
  schoolId: string;
  userId: string;
  conversationId: string | null;
  question: string;
  answer: string;
  model: string;
  citations: Citation[];
  profile: AiProfile;
}): Promise<string> {
  const client = await db();
  let conversationId = args.conversationId;

  if (conversationId) {
    const { data } = await client
      .from("siga_ai_conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("school_id", args.schoolId)
      .eq("user_id", args.userId)
      .maybeSingle();
    if (!data) conversationId = null;
  }

  if (!conversationId) {
    const { data, error } = await client
      .from("siga_ai_conversations")
      .insert({
        school_id: args.schoolId,
        user_id: args.userId,
        title: deriveConversationTitle(args.question),
        profile: args.profile,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error("Não foi possível guardar a conversa.");
    conversationId = String((data as Row)["id"]);
  }

  const { error: messagesError } = await client.from("siga_ai_messages").insert([
    {
      conversation_id: conversationId,
      school_id: args.schoolId,
      role: "user",
      content: args.question,
    },
    {
      conversation_id: conversationId,
      school_id: args.schoolId,
      role: "assistant",
      content: args.answer,
      model: args.model,
      citations: args.citations,
    },
  ]);
  if (messagesError) throw new Error("Não foi possível guardar as mensagens da conversa.");

  await client
    .from("siga_ai_conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversationId)
    .eq("school_id", args.schoolId);

  return conversationId!;
}

export type ConversationSummary = {
  id: string;
  title: string;
  lastMessageAt: string | null;
  createdAt: string;
};

export async function listConversations(
  schoolId: string,
  userId: string,
  options: { query?: string; limit: number },
): Promise<ConversationSummary[]> {
  let builder = (await db())
    .from("siga_ai_conversations")
    .select("id, title, last_message_at, created_at")
    .eq("school_id", schoolId)
    .eq("user_id", userId);
  if (options.query) builder = builder.ilike("title", `%${options.query}%`);
  const { data, error } = await builder
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(options.limit);
  if (error) {
    if (isMissingRelation(error)) return [];
    throw new Error("Não foi possível ler as conversas.");
  }
  return ((data ?? []) as Row[]).map((row) => ({
    id: String(row["id"]),
    title: String(row["title"] ?? "Conversa"),
    lastMessageAt: str(row["last_message_at"]),
    createdAt: String(row["created_at"]),
  }));
}

export type ConversationMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  model: string | null;
  citations: Citation[];
  createdAt: string;
};

export async function getConversation(
  schoolId: string,
  userId: string,
  conversationId: string,
): Promise<{ summary: ConversationSummary; messages: ConversationMessage[] } | null> {
  const client = await db();
  const { data: conversation } = await client
    .from("siga_ai_conversations")
    .select("id, title, last_message_at, created_at")
    .eq("id", conversationId)
    .eq("school_id", schoolId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!conversation) return null;
  const { data } = await client
    .from("siga_ai_messages")
    .select("id, role, content, model, citations, created_at")
    .eq("conversation_id", conversationId)
    .eq("school_id", schoolId)
    .order("created_at", { ascending: true })
    .limit(400);
  const row = conversation as Row;
  return {
    summary: {
      id: String(row["id"]),
      title: String(row["title"] ?? "Conversa"),
      lastMessageAt: str(row["last_message_at"]),
      createdAt: String(row["created_at"]),
    },
    messages: ((data ?? []) as Row[]).map((message) => ({
      id: String(message["id"]),
      role: str(message["role"]) === "assistant" ? "assistant" : "user",
      content: String(message["content"] ?? ""),
      model: str(message["model"]),
      citations: Array.isArray(message["citations"]) ? (message["citations"] as Citation[]) : [],
      createdAt: String(message["created_at"]),
    })),
  };
}

export async function deleteConversation(
  schoolId: string,
  userId: string,
  conversationId: string,
): Promise<void> {
  const client = await db();
  const { data } = await client
    .from("siga_ai_conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("school_id", schoolId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return;
  await client
    .from("siga_ai_messages")
    .delete()
    .eq("conversation_id", conversationId)
    .eq("school_id", schoolId);
  await client
    .from("siga_ai_conversations")
    .delete()
    .eq("id", conversationId)
    .eq("school_id", schoolId);
}

export async function renameConversation(
  schoolId: string,
  userId: string,
  conversationId: string,
  title: string,
): Promise<void> {
  const { error } = await (
    await db()
  )
    .from("siga_ai_conversations")
    .update({ title })
    .eq("id", conversationId)
    .eq("school_id", schoolId)
    .eq("user_id", userId);
  if (error) throw new Error("Não foi possível renomear a conversa.");
}

// ---------------------------------------------------------------------------
// Documentos (base de conhecimento)

export type AiDocumentSummary = {
  id: string;
  title: string;
  scope: AiDocumentScope;
  chunkCount: number;
  sourceName: string | null;
  createdAt: string;
  ownerUserId: string | null;
};

export async function ingestDocument(
  membership: SgaMembershipContext,
  userId: string,
  input: IngestDocumentInput,
): Promise<AiDocumentSummary> {
  const settings = await loadAiSettings(membership.schoolId);
  if (!settings.enabled) throw new Error("O SIGA AI não está activado nesta escola.");
  // Documentos da escola e públicos são base institucional: só pessoal com
  // escrita os carrega. Pessoais são do próprio utilizador.
  if (input.scope !== "personal" && !["Administrador", "Secretaria"].includes(membership.appRole)) {
    throw new Error("Só a administração e a secretaria carregam documentos da escola.");
  }

  const endpoints = resolveAiEndpoints(settings);
  if (!endpoints.vectorBaseUrl) {
    throw new Error(
      "A base documental não está configurada. Indique o endereço do Qdrant em Configurações → SIGA AI.",
    );
  }

  const chunks = chunkText(input.text);
  if (!chunks.length) throw new Error("Não foi possível extrair texto deste documento.");
  if (chunks.length > MAX_DOCUMENT_CHUNKS) {
    throw new Error(
      `Documento demasiado extenso (${chunks.length} fragmentos). Divida-o em partes menores.`,
    );
  }

  const client = await db();
  const documentId = randomUUID();
  const { error: insertError } = await client.from("siga_ai_documents").insert({
    id: documentId,
    school_id: membership.schoolId,
    title: input.title,
    scope: input.scope,
    owner_user_id: input.scope === "personal" ? userId : null,
    source_name: input.sourceName ?? null,
    mime_type: input.mimeType ?? null,
    chunk_count: chunks.length,
    char_count: input.text.length,
    created_by: userId,
  });
  if (insertError) throw new Error("Não foi possível registar o documento.");

  try {
    await ensureCollection(endpoints.vectorBaseUrl);
    const vectors = await embedBatched(
      endpoints.chatBaseUrl,
      EMBEDDING_MODEL,
      chunks.map((chunk) => toDocumentEmbeddingInput(chunk.text)),
    );
    const points: KbPoint[] = chunks.map((chunk, index) => ({
      id: randomUUID(),
      vector: vectors[index]!,
      payload: {
        school_id: membership.schoolId,
        document_id: documentId,
        document_title: input.title,
        scope: input.scope,
        owner_user_id: input.scope === "personal" ? userId : null,
        chunk_index: chunk.index,
        text: chunk.text,
        keywords: chunk.keywords,
        active: true,
        created_at: Date.now(),
      },
    }));
    await upsertPoints(endpoints.vectorBaseUrl, points);
  } catch (error) {
    // Documento registado mas não indexado seria um documento invisível que a
    // escola acha que está na base: desfazer o registo.
    await client
      .from("siga_ai_documents")
      .delete()
      .eq("id", documentId)
      .eq("school_id", membership.schoolId);
    throw error;
  }

  await recordAccessAudit({
    schoolId: membership.schoolId,
    actorUserId: userId,
    action: "siga_ai.document.ingest",
    entityType: "siga_ai_documents",
    entityId: documentId,
    metadata: { title: input.title, scope: input.scope, chunks: chunks.length },
  });

  return {
    id: documentId,
    title: input.title,
    scope: input.scope,
    chunkCount: chunks.length,
    sourceName: input.sourceName ?? null,
    createdAt: new Date().toISOString(),
    ownerUserId: input.scope === "personal" ? userId : null,
  };
}

export async function listDocuments(
  membership: SgaMembershipContext,
  userId: string,
  options: { scope?: AiDocumentScope; limit: number },
): Promise<AiDocumentSummary[]> {
  let builder = (await db())
    .from("siga_ai_documents")
    .select("id, title, scope, chunk_count, source_name, created_at, owner_user_id")
    .eq("school_id", membership.schoolId);
  if (options.scope) builder = builder.eq("scope", options.scope);
  const { data, error } = await builder
    .order("created_at", { ascending: false })
    .limit(options.limit);
  if (error) {
    if (isMissingRelation(error)) return [];
    throw new Error("Não foi possível ler os documentos.");
  }
  return (
    ((data ?? []) as Row[])
      // Os pessoais só aparecem ao dono — a mesma regra do filtro de vectores.
      .filter((row) => str(row["scope"]) !== "personal" || str(row["owner_user_id"]) === userId)
      .map((row) => ({
        id: String(row["id"]),
        title: String(row["title"] ?? "Documento"),
        scope: (str(row["scope"]) as AiDocumentScope) ?? "school",
        chunkCount: typeof row["chunk_count"] === "number" ? row["chunk_count"] : 0,
        sourceName: str(row["source_name"]),
        createdAt: String(row["created_at"]),
        ownerUserId: str(row["owner_user_id"]),
      }))
  );
}

export async function deleteDocument(
  membership: SgaMembershipContext,
  userId: string,
  documentId: string,
): Promise<void> {
  const client = await db();
  const { data } = await client
    .from("siga_ai_documents")
    .select("id, scope, owner_user_id")
    .eq("id", documentId)
    .eq("school_id", membership.schoolId)
    .maybeSingle();
  if (!data) return;
  const row = data as Row;
  const isPersonal = str(row["scope"]) === "personal";
  if (
    isPersonal
      ? str(row["owner_user_id"]) !== userId
      : !["Administrador", "Secretaria"].includes(membership.appRole)
  ) {
    throw new Error("Sem permissão para remover este documento.");
  }

  const settings = await loadAiSettings(membership.schoolId);
  const endpoints = resolveAiEndpointsOrNull(settings);
  if (endpoints?.vectorBaseUrl) {
    await deleteVectorDocument(endpoints.vectorBaseUrl, membership.schoolId, documentId);
  }
  await client
    .from("siga_ai_documents")
    .delete()
    .eq("id", documentId)
    .eq("school_id", membership.schoolId);

  await recordAccessAudit({
    schoolId: membership.schoolId,
    actorUserId: userId,
    action: "siga_ai.document.delete",
    entityType: "siga_ai_documents",
    entityId: documentId,
  });
}

// ---------------------------------------------------------------------------
// Utilização (métricas da área administrativa)

async function recordUsage(entry: {
  schoolId: string;
  userId: string;
  model: string;
  mode: AiSettings["mode"];
  elapsedMs: number;
  questionChars: number;
  answerChars: number;
  citations: number;
}): Promise<void> {
  try {
    const { error } = await (await db()).from("siga_ai_usage").insert({
      school_id: entry.schoolId,
      user_id: entry.userId,
      model: entry.model,
      mode: entry.mode,
      elapsed_ms: entry.elapsedMs,
      question_chars: entry.questionChars,
      answer_chars: entry.answerChars,
      citations: entry.citations,
    });
    if (error) console.error("[siga-ai] registo de utilização:", error.message);
  } catch (error) {
    // Métrica não impede a resposta que já foi dada.
    console.error("[siga-ai] registo de utilização:", error);
  }
}

export type AiUsageMetrics = {
  last24h: number;
  last7d: number;
  avgElapsedMs: number | null;
  topModels: Array<{ model: string; count: number }>;
};

export async function getUsageMetrics(schoolId: string): Promise<AiUsageMetrics> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await (
    await db()
  )
    .from("siga_ai_usage")
    .select("model, elapsed_ms, created_at")
    .eq("school_id", schoolId)
    .gte("created_at", since)
    .limit(5000);
  if (error) return { last24h: 0, last7d: 0, avgElapsedMs: null, topModels: [] };
  const rows = (data ?? []) as Row[];
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const elapsed = rows
    .map((row) => (typeof row["elapsed_ms"] === "number" ? row["elapsed_ms"] : null))
    .filter((value): value is number => value !== null);
  const counts = new Map<string, number>();
  for (const row of rows) {
    const model = String(row["model"] ?? "—");
    counts.set(model, (counts.get(model) ?? 0) + 1);
  }
  return {
    last24h: rows.filter((row) => Date.parse(String(row["created_at"])) >= dayAgo).length,
    last7d: rows.length,
    avgElapsedMs: elapsed.length
      ? Math.round(elapsed.reduce((total, value) => total + value, 0) / elapsed.length)
      : null,
    topModels: [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([model, count]) => ({ model, count })),
  };
}
