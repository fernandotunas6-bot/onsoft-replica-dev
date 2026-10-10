import type { requireMobileAcademicAccess } from "./authorization";
import { isoMicros } from "./timestamps";
import type { MobileAcademicScope } from "./academic-scope.server";
import {
  parseChatInbox,
  parseChatHistory,
  type ChatInbox,
  type ChatHistory,
  type ChatCursor,
} from "../../../mobile-v4/src/domain/institutional-chat";
import { MobileApiError } from "./errors";
type Db = Awaited<ReturnType<typeof requireMobileAcademicAccess>>["db"];
async function read<T>(
  q: PromiseLike<{ data: T[] | null; error: unknown; count: number | null }>,
  maximum?: number,
): Promise<T[]> {
  const r = await q;
  if (
    r.error ||
    !r.data ||
    r.count == null ||
    r.data.length !== (maximum === undefined ? r.count : Math.min(r.count, maximum))
  )
    throw new MobileApiError(503, "CHAT_UNAVAILABLE");
  return r.data;
}
// Preserve PostgreSQL microseconds: truncating to JS milliseconds loses messages at page boundaries.
const iso = isoMicros;
type Member = { conversation_id: string; user_id: string; last_read_at: string };
type Message = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
  deleted_at: string | null;
  reply_to: string | null;
  attachment_file_id: string | null;
  attachment_file_name: string | null;
};
async function profiles(db: Db, ids: string[]) {
  if (!ids.length) return new Map<string, string>();
  const rows = await read<{ id: string; full_name: string | null }>(
    db
      .from("profiles")
      .select("id, full_name", { count: "exact" })
      .in("id", [...new Set(ids)])
      .limit(1000),
  );
  return new Map(rows.map((p) => [p.id, p.full_name?.trim() || "Nome não disponível"]));
}
export async function readMobileChat(
  db: Db,
  scope: MobileAcademicScope,
  userId: string,
  conversationId?: string,
  before?: ChatCursor,
): Promise<ChatInbox | ChatHistory> {
  const ctx = { schoolId: scope.schoolId, userId, role: scope.role };
  const owned = await read<{ conversation_id: string; last_read_at: string }>(
    db
      .from("siga_chat_members")
      .select("conversation_id, last_read_at", { count: "exact" })
      .eq("user_id", userId)
      .limit(1000),
  );
  if (conversationId && !owned.some((m) => m.conversation_id === conversationId))
    throw new MobileApiError(403, "CHAT_FORBIDDEN");
  if (!owned.length) return { schoolId: scope.schoolId, userId, role: scope.role, threads: [] };
  const conversations = await read<{ id: string; type: string; title: string | null }>(
    db
      .from("siga_chat_conversations")
      .select("id, type, title", { count: "exact" })
      .eq("school_id", scope.schoolId)
      .in("id", conversationId ? [conversationId] : owned.map((m) => m.conversation_id))
      .limit(1000),
  );
  if (conversationId && !conversations.length) throw new MobileApiError(403, "CHAT_FORBIDDEN");
  if (!conversations.length)
    return { schoolId: scope.schoolId, userId, role: scope.role, threads: [] };
  const members = await read<Member>(
    db
      .from("siga_chat_members")
      .select("conversation_id, user_id, last_read_at", { count: "exact" })
      .in(
        "conversation_id",
        conversations.map((c) => c.id),
      )
      .limit(1000),
  );
  if (
    conversations.some(
      (c) => !members.some((m) => m.conversation_id === c.id && m.user_id === userId),
    )
  )
    throw new MobileApiError(403, "CHAT_FORBIDDEN");
  if (!conversationId) {
    const peers = [...new Set(members.filter((m) => m.user_id !== userId).map((m) => m.user_id))];
    const names = await profiles(db, peers);
    const active = peers.length
      ? await read<{ user_id: string }>(
          db
            .from("school_memberships")
            .select("user_id", { count: "exact" })
            .eq("school_id", scope.schoolId)
            .eq("status", "active")
            .in("user_id", peers)
            .limit(1000),
        )
      : [];
    const threads: ChatInbox["threads"] = [];
    // Bound concurrent count queries; avoid one serial round trip per conversation.
    for (let offset = 0; offset < conversations.length; offset += 8) {
      const batch = await Promise.all(
        conversations.slice(offset, offset + 8).map(async (c) => {
          const peers = members.filter((m) => m.conversation_id === c.id && m.user_id !== userId);
          if (c.type === "direct" && peers.length !== 1)
            throw new MobileApiError(503, "CHAT_INCONSISTENT");
          const readAt = owned.find((m) => m.conversation_id === c.id)!.last_read_at;
          if (!Number.isFinite(Date.parse(readAt)))
            throw new MobileApiError(503, "CHAT_INCONSISTENT");
          const unread = await db
            .from("siga_chat_messages")
            .select("id", { count: "exact", head: true })
            .eq("school_id", scope.schoolId)
            .eq("conversation_id", c.id)
            .neq("sender_id", userId)
            .is("deleted_at", null)
            .gt("created_at", readAt);
          if (unread.error || unread.count == null)
            throw new MobileApiError(503, "CHAT_UNAVAILABLE");
          return {
            id: c.id,
            type: c.type as "direct" | "group",
            name:
              c.type === "group"
                ? c.title?.trim() || "Grupo sem título"
                : names.get(peers[0].user_id) || "Nome não disponível",
            unread: unread.count,
            peerLeft: c.type === "direct" && !active.some((a) => a.user_id === peers[0].user_id),
          };
        }),
      );
      threads.push(...batch);
    }
    try {
      return parseChatInbox({ ...ctx, threads }, ctx);
    } catch {
      throw new MobileApiError(503, "CHAT_INCONSISTENT");
    }
  }
  let query = db
    .from("siga_chat_messages")
    .select(
      "id, sender_id, body, created_at, deleted_at, reply_to, attachment_file_id, attachment_file_name",
      { count: "exact" },
    )
    .eq("school_id", scope.schoolId)
    .eq("conversation_id", conversationId);
  if (before)
    query = query.or(
      `created_at.lt.${before.date},and(created_at.eq.${before.date},id.lt.${before.id})`,
    );
  const page = await read<Message>(
    query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(61),
    61,
  );
  const selected = page.slice(0, 60).reverse();
  const replyIds = [
    ...new Set(
      selected.filter((m) => !m.deleted_at).flatMap((m) => (m.reply_to ? [m.reply_to] : [])),
    ),
  ];
  const replies = replyIds.length
    ? await read<Message>(
        db
          .from("siga_chat_messages")
          .select(
            "id, sender_id, body, created_at, deleted_at, reply_to, attachment_file_id, attachment_file_name",
            { count: "exact" },
          )
          .eq("school_id", scope.schoolId)
          .eq("conversation_id", conversationId)
          .in("id", replyIds)
          .limit(1000),
      )
    : [];
  if (replyIds.some((id) => !replies.some((r) => r.id === id)))
    throw new MobileApiError(503, "CHAT_INCONSISTENT");
  const names = await profiles(
    db,
    [...selected, ...replies].map((m) => m.sender_id),
  );
  const peerRead = Math.max(
    0,
    ...members
      .filter((m) => m.user_id !== userId)
      .map((m) => Date.parse(m.last_read_at))
      .filter(Number.isFinite),
  );
  const messages: ChatHistory["messages"] = selected.map((m) => {
    const parent = replies.find((r) => r.id === m.reply_to);
    const deleted = !!m.deleted_at;
    return {
      id: m.id,
      senderId: m.sender_id,
      senderName: names.get(m.sender_id) || "Nome não disponível",
      body: deleted ? "" : m.body,
      createdAt: iso(m.created_at),
      deleted,
      status: m.sender_id === userId && Date.parse(m.created_at) <= peerRead ? "read" : "sent",
      reply:
        !deleted && parent
          ? {
              id: parent.id,
              body: parent.deleted_at ? "" : parent.body,
              senderName: names.get(parent.sender_id) || "Nome não disponível",
            }
          : null,
      attachment:
        !deleted && m.attachment_file_id
          ? { id: m.attachment_file_id, name: m.attachment_file_name?.trim() || "Anexo sem nome" }
          : null,
    };
  });
  const result = {
    ...ctx,
    conversationId,
    messages,
    next: page.length > 60 ? { date: messages[0].createdAt, id: messages[0].id } : null,
  };
  try {
    return parseChatHistory(result, ctx, conversationId, before);
  } catch {
    throw new MobileApiError(503, "CHAT_INCONSISTENT");
  }
}
