import { z } from "zod";
import { AI_PROFILES } from "./prompts";

/** Modos de funcionamento (§4 do pedido). */
export const aiModeEnum = z.enum(["local", "school_server", "remote"]);
export type AiMode = z.infer<typeof aiModeEnum>;

/** Estado de um serviço de IA, mostrado na interface e no diagnóstico. */
export const aiServiceStateEnum = z.enum(["available", "model_missing", "unreachable", "disabled"]);

export const aiDocumentScopeEnum = z.enum(["personal", "school", "public"]);
export type AiDocumentScope = z.infer<typeof aiDocumentScopeEnum>;

export const askAiInputSchema = z.object({
  conversationId: z.string().uuid().optional(),
  question: z.string().trim().min(2, "Escreva a pergunta.").max(4000),
  profile: z.enum(AI_PROFILES).optional(),
  model: z.string().trim().min(1).max(120).optional(),
  /** Consultar a base documental autorizada (RAG). */
  useKnowledgeBase: z.boolean().default(true),
});
export type AskAiInput = z.infer<typeof askAiInputSchema>;

export const listConversationsInputSchema = z.object({
  query: z.string().trim().max(200).optional(),
  limit: z.number().int().min(1).max(100).default(30),
});

export const conversationIdInputSchema = z.object({ conversationId: z.string().uuid() });

export const renameConversationInputSchema = z.object({
  conversationId: z.string().uuid(),
  title: z.string().trim().min(1).max(120),
});

/**
 * Limites de ingestão. 400 KB de texto extraído e 400 fragmentos: a 1500 tokens
 * por fragmento, cobre um manual escolar inteiro e impede que um ficheiro
 * sozinho ocupe o embedder durante minutos.
 */
export const MAX_DOCUMENT_CHARS = 400_000;
export const MAX_DOCUMENT_CHUNKS = 400;

export const ingestDocumentInputSchema = z.object({
  title: z.string().trim().min(2, "Dê um título ao documento.").max(200),
  /** Texto já extraído no cliente (TXT/Markdown nesta fase — ver auditoria §8). */
  text: z
    .string()
    .min(20, "O documento está vazio ou não foi possível extrair o texto.")
    .max(MAX_DOCUMENT_CHARS, "Documento demasiado grande. Divida-o em partes."),
  scope: aiDocumentScopeEnum.default("school"),
  sourceName: z.string().trim().max(260).optional(),
  mimeType: z.string().trim().max(120).optional(),
});
export type IngestDocumentInput = z.infer<typeof ingestDocumentInputSchema>;

export const listDocumentsInputSchema = z.object({
  scope: aiDocumentScopeEnum.optional(),
  limit: z.number().int().min(1).max(200).default(50),
});

export const documentIdInputSchema = z.object({ documentId: z.string().uuid() });

/** Configuração da IA por escola (área administrativa, §10). */
export const updateAiSettingsInputSchema = z.object({
  enabled: z.boolean().optional(),
  mode: aiModeEnum.optional(),
  /** Endpoint do Ollama/servidor escolar. Validado no servidor (SSRF). */
  endpointUrl: z.string().trim().max(300).nullable().optional(),
  vectorUrl: z.string().trim().max(300).nullable().optional(),
  chatModel: z.string().trim().max(120).nullable().optional(),
  /** Autorização explícita para usar IA remota com dados desta escola. */
  remoteAllowed: z.boolean().optional(),
  /** Perfis com acesso ao assistente. */
  allowedProfiles: z.array(z.enum(AI_PROFILES)).max(AI_PROFILES.length).optional(),
  /** Perguntas por hora e por conta. */
  hourlyLimit: z.number().int().min(1).max(500).optional(),
  /** Dias de retenção das conversas; 0 = guardar sem limite. */
  retentionDays: z.number().int().min(0).max(3650).optional(),
});
export type UpdateAiSettingsInput = z.infer<typeof updateAiSettingsInputSchema>;
