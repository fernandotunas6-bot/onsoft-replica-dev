/**
 * Funções de servidor do SIGA AI. Camada fina: autenticação, resolução da
 * escola e delegação no gateway (`gateway.server.ts`).
 *
 * Nenhuma função aqui aceita `schoolId` do cliente. Quem pergunta é quem a
 * sessão diz que é, na escola que a membership diz que é.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireSgaWriter, resolveSgaMembershipAdmin } from "@/integrations/supabase/sga-admin";
import type { SgaMembershipContext } from "@/integrations/supabase/sga";
import {
  askAi,
  deleteConversation,
  deleteDocument,
  getAiStatus,
  getConversation,
  getUsageMetrics,
  ingestDocument,
  listConversations,
  listDocuments,
  loadAiSettings,
  renameConversation,
  saveAiSettings,
} from "./gateway.server";
import {
  askAiInputSchema,
  conversationIdInputSchema,
  documentIdInputSchema,
  ingestDocumentInputSchema,
  listConversationsInputSchema,
  listDocumentsInputSchema,
  renameConversationInputSchema,
  updateAiSettingsInputSchema,
} from "./schemas";

/** Qualquer utilizador com membership activa pode usar o assistente. */
async function requireMembership(userId: string): Promise<SgaMembershipContext> {
  const membership = await resolveSgaMembershipAdmin(userId);
  if (!membership) throw new Error("Sem membership activa nesta escola.");
  return membership;
}

export const aiStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => getAiStatus(await requireMembership(context.userId)));

export const aiAsk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => askAiInputSchema.parse(input))
  .handler(async ({ data, context }) =>
    askAi(await requireMembership(context.userId), context.userId, data),
  );

export const aiListConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => listConversationsInputSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const membership = await requireMembership(context.userId);
    return listConversations(membership.schoolId, context.userId, data);
  });

export const aiGetConversation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => conversationIdInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireMembership(context.userId);
    return getConversation(membership.schoolId, context.userId, data.conversationId);
  });

export const aiDeleteConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => conversationIdInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireMembership(context.userId);
    await deleteConversation(membership.schoolId, context.userId, data.conversationId);
    return { ok: true } as const;
  });

export const aiRenameConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => renameConversationInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireMembership(context.userId);
    await renameConversation(membership.schoolId, context.userId, data.conversationId, data.title);
    return { ok: true } as const;
  });

export const aiListDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => listDocumentsInputSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const membership = await requireMembership(context.userId);
    return listDocuments(membership, context.userId, data);
  });

export const aiIngestDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => ingestDocumentInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireMembership(context.userId);
    return ingestDocument(membership, context.userId, data);
  });

export const aiDeleteDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => documentIdInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireMembership(context.userId);
    await deleteDocument(membership, context.userId, data.documentId);
    return { ok: true } as const;
  });

// --- Área administrativa (§10) --------------------------------------------
// Só Administrador: configurar a IA de uma escola é decidir que dados saem
// (modo remoto) e quanto hardware se gasta.

export const aiGetSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const membership = await requireSgaWriter(context.userId, ["Administrador"]);
    const [settings, metrics] = await Promise.all([
      loadAiSettings(membership.schoolId),
      getUsageMetrics(membership.schoolId),
    ]);
    return { settings, metrics };
  });

export const aiUpdateSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => updateAiSettingsInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriter(context.userId, ["Administrador"]);
    return saveAiSettings(membership, context.userId, data);
  });
