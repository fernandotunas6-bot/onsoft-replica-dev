import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { loadSgaAdminClient, resolveSgaMembershipAdmin } from "@/integrations/supabase/sga-admin";
import { canShareFileInMessage, loadAttachableFile } from "./attachments";
import { schoolRolesOf } from "./server";

const FILES_BUCKET = "siga-files";

const signMessageAttachmentInputSchema = z.object({
  // As mensagens directas antigas (`siga_direct_messages`) foram copiadas para o
  // chat a 2026-10-02 e já ninguém lá escreve: os anexos abrem só pelo chat.
  source: z.literal("chat"),
  messageId: z.string().uuid(),
});

/**
 * Abre o anexo de uma mensagem para quem participa na conversa — pessoal,
 * encarregado ou aluno. A mensagem é lida na escola activa; o anexo só abre se
 * quem o enviou ainda o puder abrir (ver `attachments.ts`).
 */
export const signMessageAttachment = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => signMessageAttachmentInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida.");
    const userId = context.userId;
    const membership = await resolveSgaMembershipAdmin(userId);
    if (!membership) throw new Error("Sem membership activa nesta escola.");
    const db = await loadSgaAdminClient();

    const { data: message, error } = await db
      .from("siga_chat_messages")
      .select("conversation_id, sender_id, attachment_file_id, deleted_at")
      .eq("id", data.messageId)
      .eq("school_id", membership.schoolId)
      .maybeSingle();
    if (error) throw publicDatabaseError(error, "Não foi possível abrir o anexo.");
    if (!message || message.deleted_at) throw new Error("Anexo não encontrado.");
    const { data: member } = await db
      .from("siga_chat_members")
      .select("user_id")
      .eq("conversation_id", message.conversation_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!member) throw new Error("Não participa nesta conversa.");
    const senderId = String(message.sender_id);
    const fileId = message.attachment_file_id ? String(message.attachment_file_id) : null;
    if (!fileId) throw new Error("Anexo não encontrado.");

    const file = await loadAttachableFile(db, membership.schoolId, fileId);
    if (!file) throw new Error("O anexo já não existe.");
    const senderRoles =
      senderId === userId
        ? (membership.allAppRoles ?? [membership.appRole])
        : await schoolRolesOf(db, membership.schoolId, senderId);
    if (!canShareFileInMessage(file, senderId, senderRoles)) {
      throw new Error("Sem permissão para abrir este anexo.");
    }

    if (file.storageBackend !== "sga") return { url: null };
    const signed = await db.storage.from(FILES_BUCKET).createSignedUrl(file.storagePath, 600);
    if (signed.error || !signed.data?.signedUrl) return { url: null };
    return { url: signed.data.signedUrl };
  });
