import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { loadSgaAdminClient, resolveSgaMembershipAdmin } from "@/integrations/supabase/sga-admin";
import { isMessagingStaff, loadSchoolColleagues } from "./server";
import {
  conversationInputSchema,
  deleteChatMessageInputSchema,
  listChatMessagesInputSchema,
  sendChatMessageInputSchema,
  startDirectInputSchema,
  type ChatContact,
  type ChatConversation,
  type ChatConversationType,
  type ChatMessage,
} from "./chat-schemas";

const MISSING_TABLE = /schema cache|does not exist|42P01|PGRST/i;

/** As tabelas do chat podem ainda não estar aplicadas em produção (ver memória:
 *  as migrações são corridas à mão). Nesse caso a UI mostra um aviso honesto em
 *  vez de rebentar. */
export class ChatSchemaMissing extends Error {
  constructor() {
    super("CHAT_SCHEMA_MISSING");
  }
}

function missingChatTables(error: { message?: string } | null) {
  return Boolean(error?.message && MISSING_TABLE.test(error.message));
}

type Db = Awaited<ReturnType<typeof loadSgaAdminClient>>;

type ProfileRow = {
  id: string;
  full_name?: string | null;
  avatar_url?: string | null;
  cargo?: string | null;
};

const TYPE_BY_CARGO: Record<string, ChatConversationType> = {
  Encarregado: "guardian",
  Aluno: "student",
};

async function loadProfiles(db: Db, ids: string[]): Promise<Map<string, ProfileRow>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const { data, error } = await db
    .from("profiles")
    .select("id, full_name, avatar_url, cargo")
    .in("id", unique);
  if (error && /avatar_url|cargo|42703|schema cache/i.test(error.message)) {
    const { data: fallback } = await db.from("profiles").select("id, full_name").in("id", unique);
    return new Map((fallback ?? []).map((row) => [String(row.id), row as ProfileRow]));
  }
  return new Map((data ?? []).map((row) => [String(row.id), row as ProfileRow]));
}

function nameOf(profile: ProfileRow | undefined) {
  return String(profile?.full_name ?? "").trim() || "Colega";
}

/** Confirma que a pessoa é membro da conversa — o servidor usa a chave de
 *  serviço (BYPASSRLS), por isso esta verificação não é redundante. */
async function assertMember(db: Db, conversationId: string, userId: string) {
  const { data, error } = await db
    .from("siga_chat_members")
    .select("conversation_id")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error && missingChatTables(error)) throw new ChatSchemaMissing();
  if (!data) throw new Error("Não participa nesta conversa.");
}

type MessageRow = {
  id: string;
  sender_id: string;
  body?: string | null;
  reply_to?: string | null;
  attachment_file_id?: string | null;
  attachment_file_name?: string | null;
  deleted_at?: string | null;
  created_at: string;
};

function toMessage(
  row: MessageRow,
  userId: string,
  names: Map<string, ProfileRow>,
  peerReadAt: number,
  replies: Map<string, MessageRow>,
): ChatMessage {
  const ts = Date.parse(row.created_at);
  const mine = String(row.sender_id) === userId;
  const gone = Boolean(row.deleted_at);
  const parent = row.reply_to ? replies.get(String(row.reply_to)) : undefined;
  return {
    id: String(row.id),
    ts,
    text: gone ? "" : String(row.body ?? ""),
    from: mine ? "me" : nameOf(names.get(String(row.sender_id))),
    status: mine ? (ts <= peerReadAt ? "read" : "sent") : "sent",
    deleted: gone,
    replyTo: parent
      ? {
          id: String(parent.id),
          text: parent.deleted_at ? "" : String(parent.body ?? ""),
          from:
            String(parent.sender_id) === userId
              ? "me"
              : nameOf(names.get(String(parent.sender_id))),
        }
      : null,
    file:
      row.attachment_file_id && !gone
        ? {
            fileId: String(row.attachment_file_id),
            name: String(row.attachment_file_name ?? "Anexo"),
            size: 0,
          }
        : null,
  };
}

// ------------------------------------------------------------ conversas ---

export const listChatConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!context) throw new Error("Unauthorized");
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem membership activa nesta escola.");
    const db = await loadSgaAdminClient();

    const { data: memberRows, error: memberError } = await db
      .from("siga_chat_members")
      .select("conversation_id, last_read_at")
      .eq("user_id", context.userId);
    if (memberError) {
      if (missingChatTables(memberError)) return { storage: "missing" as const, conversations: [] };
      throw publicDatabaseError(memberError, "Não foi possível listar as conversas.");
    }

    const convIds = (memberRows ?? []).map((row) => String(row.conversation_id));
    if (!convIds.length)
      return { storage: "sga" as const, conversations: [] as ChatConversation[] };
    const readAtById = new Map(
      (memberRows ?? []).map((row) => [String(row.conversation_id), String(row.last_read_at)]),
    );

    const { data: convRows, error: convError } = await db
      .from("siga_chat_conversations")
      .select("id, type, title, student_id, school_id")
      .eq("school_id", membership.schoolId)
      .in("id", convIds);
    if (convError) throw publicDatabaseError(convError, "Não foi possível ler as conversas.");
    const visibleIds = (convRows ?? []).map((row) => String(row.id));
    if (!visibleIds.length) return { storage: "sga" as const, conversations: [] };

    // Todos os participantes de uma vez: o nome de uma conversa directa é o da
    // outra pessoa, e sem isto seria uma consulta por conversa.
    const { data: allMembers } = await db
      .from("siga_chat_members")
      .select("conversation_id, user_id")
      .in("conversation_id", visibleIds);
    const peersByConv = new Map<string, string[]>();
    for (const row of allMembers ?? []) {
      const cid = String(row.conversation_id);
      const uid = String(row.user_id);
      if (uid === context.userId) continue;
      peersByConv.set(cid, [...(peersByConv.get(cid) ?? []), uid]);
    }

    const { data: lastRows } = await db
      .from("siga_chat_messages")
      .select("id, conversation_id, sender_id, body, attachment_file_name, deleted_at, created_at")
      .in("conversation_id", visibleIds)
      .order("created_at", { ascending: false })
      .limit(600);

    const lastByConv = new Map<string, NonNullable<typeof lastRows>[number]>();
    const unreadByConv = new Map<string, number>();
    for (const row of lastRows ?? []) {
      const cid = String(row.conversation_id);
      if (!lastByConv.has(cid)) lastByConv.set(cid, row);
      const readAt = Date.parse(readAtById.get(cid) ?? "");
      if (
        String(row.sender_id) !== context.userId &&
        !row.deleted_at &&
        (Number.isNaN(readAt) || Date.parse(String(row.created_at)) > readAt)
      ) {
        unreadByConv.set(cid, (unreadByConv.get(cid) ?? 0) + 1);
      }
    }

    const profiles = await loadProfiles(db, [...peersByConv.values()].flat());

    const conversations: ChatConversation[] = (convRows ?? []).map((row) => {
      const id = String(row.id);
      const isGroup = String(row.type) === "group";
      const peers = peersByConv.get(id) ?? [];
      const peerId = isGroup ? null : (peers[0] ?? null);
      const peer = peerId ? profiles.get(peerId) : undefined;
      const cargo = String(peer?.cargo ?? "").trim();
      const last = lastByConv.get(id);

      return {
        id,
        type: isGroup ? "group" : (TYPE_BY_CARGO[cargo] ?? "staff"),
        name: isGroup ? String(row.title ?? "Grupo") : nameOf(peer),
        sub: isGroup ? `${peers.length + 1} participantes` : cargo || "Equipa",
        peerId,
        avatarUrl: peer?.avatar_url ? String(peer.avatar_url) : null,
        unread: unreadByConv.get(id) ?? 0,
        student: row.student_id ? { id: String(row.student_id) } : undefined,
        loaded: false,
        messages: last
          ? [
              {
                id: `last-${id}`,
                ts: Date.parse(String(last.created_at)),
                text: last.deleted_at
                  ? ""
                  : String(last.body ?? "") ||
                    (last.attachment_file_name ? `📎 ${last.attachment_file_name}` : ""),
                from:
                  String(last.sender_id) === context.userId
                    ? "me"
                    : nameOf(profiles.get(String(last.sender_id))),
                status: "sent" as const,
                deleted: Boolean(last.deleted_at),
                replyTo: null,
                file: null,
              },
            ]
          : [],
      };
    });

    conversations.sort((a, b) => (b.messages.at(-1)?.ts ?? 0) - (a.messages.at(-1)?.ts ?? 0));
    return { storage: "sga" as const, conversations };
  });

export const listChatMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => listChatMessagesInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Unauthorized");
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem membership activa nesta escola.");
    const db = await loadSgaAdminClient();
    await assertMember(db, data.conversationId, context.userId);

    let query = db
      .from("siga_chat_messages")
      .select(
        "id, sender_id, body, reply_to, attachment_file_id, attachment_file_name, deleted_at, created_at",
      )
      .eq("conversation_id", data.conversationId)
      // A escola activa limita a leitura: trocar de escola não dá acesso às
      // conversas da anterior, mesmo que a pertença às duas se mantenha.
      .eq("school_id", membership.schoolId);
    if (data.before) query = query.lt("created_at", data.before);

    const [{ data: rows, error }, { data: peers }] = await Promise.all([
      query.order("created_at", { ascending: false }).limit(data.limit),
      db
        .from("siga_chat_members")
        .select("last_read_at")
        .eq("conversation_id", data.conversationId)
        .neq("user_id", context.userId),
    ]);
    if (error) throw publicDatabaseError(error, "Não foi possível carregar as mensagens.");

    const ordered = (rows ?? []).slice().reverse() as MessageRow[];
    // Só os membros lêem; se ninguém mais leu ainda, 0 deixa tudo em ✓ cinzento.
    const peerReadAt = Math.max(
      0,
      ...(peers ?? [])
        .map((row) => Date.parse(String(row.last_read_at)))
        .filter((n) => !Number.isNaN(n)),
    );

    const replyIds = [...new Set(ordered.map((row) => row.reply_to).filter(Boolean))] as string[];
    const { data: replyRows } = replyIds.length
      ? await db
          .from("siga_chat_messages")
          .select("id, sender_id, body, deleted_at, created_at")
          .in("id", replyIds)
      : { data: [] };
    const replies = new Map(
      ((replyRows ?? []) as MessageRow[]).map((row) => [String(row.id), row]),
    );

    const names = await loadProfiles(db, [
      ...ordered.map((row) => row.sender_id),
      ...((replyRows ?? []) as MessageRow[]).map((row) => row.sender_id),
    ]);

    return {
      messages: ordered.map((row) => toMessage(row, context.userId, names, peerReadAt, replies)),
      hasMore: ordered.length >= data.limit,
    };
  });

export const sendChatMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => sendChatMessageInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Unauthorized");
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem membership activa nesta escola.");
    const db = await loadSgaAdminClient();
    await assertMember(db, data.conversationId, context.userId);

    const { data: row, error } = await db
      .from("siga_chat_messages")
      .insert({
        conversation_id: data.conversationId,
        school_id: membership.schoolId,
        sender_id: context.userId,
        body: data.body?.trim() ?? "",
        reply_to: data.replyTo ?? null,
        attachment_file_id: data.attachmentFileId ?? null,
        attachment_file_name: data.attachmentFileName ?? null,
      })
      .select(
        "id, sender_id, body, reply_to, attachment_file_id, attachment_file_name, deleted_at, created_at",
      )
      .single();
    if (error) throw publicDatabaseError(error, "Não foi possível enviar a mensagem.");

    // Quem envia acabou de ler o que lá estava.
    await db
      .from("siga_chat_members")
      .update({ last_read_at: new Date().toISOString() })
      .eq("conversation_id", data.conversationId)
      .eq("user_id", context.userId);

    const names = await loadProfiles(db, [String(row.sender_id)]);
    const replies = new Map<string, MessageRow>();
    if (row.reply_to) {
      const { data: parent } = await db
        .from("siga_chat_messages")
        .select("id, sender_id, body, deleted_at, created_at")
        .eq("id", row.reply_to)
        .maybeSingle();
      if (parent) replies.set(String(parent.id), parent as MessageRow);
    }
    return toMessage(row as MessageRow, context.userId, names, 0, replies);
  });

export const deleteChatMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => deleteChatMessageInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Unauthorized");
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem membership activa nesta escola.");
    const db = await loadSgaAdminClient();
    // `sender_id` no filtro: apagar é só para o autor, nunca para quem recebeu.
    const { error } = await db
      .from("siga_chat_messages")
      .update({ deleted_at: new Date().toISOString(), body: "", attachment_file_id: null })
      .eq("id", data.messageId)
      .eq("school_id", membership.schoolId)
      .eq("sender_id", context.userId);
    if (error) throw publicDatabaseError(error, "Não foi possível apagar a mensagem.");
    return { ok: true as const };
  });

export const markChatRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => conversationInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Unauthorized");
    if (!(await resolveSgaMembershipAdmin(context.userId))) {
      throw new Error("Sem membership activa nesta escola.");
    }
    const db = await loadSgaAdminClient();
    // Sem coluna de escola em siga_chat_members: o par conversa+utilizador já
    // basta — ninguém move o marcador de leitura de outra pessoa.
    const { error } = await db
      .from("siga_chat_members")
      .update({ last_read_at: new Date().toISOString() })
      .eq("conversation_id", data.conversationId)
      .eq("user_id", context.userId);
    if (error && !missingChatTables(error)) {
      throw publicDatabaseError(error, "Não foi possível marcar como lida.");
    }
    return { ok: true as const };
  });

/** Abre (ou reaproveita) a conversa directa com alguém. A regra de quem pode
 *  falar com quem é a mesma do messenger antigo: o pessoal fala com todos,
 *  alunos e encarregados só com o pessoal. */
export const startDirectConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => startDirectInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Unauthorized");
    if (data.peerId === context.userId) throw new Error("Não pode conversar consigo próprio.");
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem membership activa nesta escola.");
    const db = await loadSgaAdminClient();

    const { data: peer } = await db
      .from("school_memberships")
      .select("user_id")
      .eq("school_id", membership.schoolId)
      .eq("user_id", data.peerId)
      .eq("status", "active")
      .maybeSingle();
    if (!peer) throw new Error("Este utilizador não pertence à escola.");

    if (!isMessagingStaff(membership.allAppRoles ?? [membership.appRole])) {
      const { data: profile } = await db
        .from("profiles")
        .select("cargo")
        .eq("id", data.peerId)
        .maybeSingle();
      if (!isMessagingStaff([String(profile?.cargo ?? "")])) {
        throw new Error("Só pode enviar mensagens ao pessoal da escola.");
      }
    }

    const [a, b] = [context.userId, data.peerId].sort();
    const directKey = `${membership.schoolId}:${a}:${b}`;

    const { data: existing, error: findError } = await db
      .from("siga_chat_conversations")
      .select("id")
      .eq("direct_key", directKey)
      .maybeSingle();
    if (findError && missingChatTables(findError)) throw new ChatSchemaMissing();
    if (existing) return { conversationId: String(existing.id) };

    const { data: created, error: createError } = await db
      .from("siga_chat_conversations")
      .insert({
        school_id: membership.schoolId,
        type: "direct",
        direct_key: directKey,
        created_by: context.userId,
      })
      .select("id")
      .single();
    // Corrida entre dois cliques: o índice único resolve, basta reler.
    if (createError) {
      const { data: raced } = await db
        .from("siga_chat_conversations")
        .select("id")
        .eq("direct_key", directKey)
        .maybeSingle();
      if (raced) return { conversationId: String(raced.id) };
      throw publicDatabaseError(createError, "Não foi possível iniciar a conversa.");
    }

    const { error: memberError } = await db.from("siga_chat_members").insert([
      { conversation_id: created.id, user_id: context.userId },
      { conversation_id: created.id, user_id: data.peerId },
    ]);
    if (memberError) throw publicDatabaseError(memberError, "Não foi possível iniciar a conversa.");

    return { conversationId: String(created.id) };
  });

export const listChatContacts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ChatContact[]> => {
    if (!context) throw new Error("Unauthorized");
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem membership activa nesta escola.");
    const db = await loadSgaAdminClient();
    const colleagues = await loadSchoolColleagues(db, membership, context.userId);
    return colleagues.map((row) => ({
      id: row.id,
      name: row.full_name,
      sub: row.cargo ?? "Equipa",
      avatarUrl: row.avatar_url,
    }));
  });
