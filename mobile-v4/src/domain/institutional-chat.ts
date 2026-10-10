import type { Context, Role } from "./model";
export type ChatCursor = { date: string; id: string };
export interface ChatInbox {
  schoolId: string;
  userId: string;
  role: Role;
  threads: {
    id: string;
    type: "direct" | "group";
    name: string;
    unread: number;
    peerLeft: boolean;
  }[];
}
export interface ChatHistory {
  schoolId: string;
  userId: string;
  role: Role;
  conversationId: string;
  messages: {
    id: string;
    senderId: string;
    senderName: string;
    body: string;
    createdAt: string;
    deleted: boolean;
    status: "sent" | "read";
    reply: { id: string; body: string; senderName: string } | null;
    attachment: { id: string; name: string } | null;
  }[];
  next: ChatCursor | null;
}
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: Record<string, unknown>, k: string[]) =>
  Object.keys(v).length === k.length && k.every((k) => k in v);
const uuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
const name = (v: unknown) => typeof v === "string" && !!v.trim() && v.length <= 500;
const body = (v: unknown) => typeof v === "string" && v.length <= 4000;
const timestamp = (v: unknown): v is string =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}T/.test(v) &&
  Number.isFinite(Date.parse(v)) &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3,6}Z$/.test(v) &&
  new Date(v).toISOString().slice(0, 19) === v.slice(0, 19);
const timeKey = (v: string) =>
  v.replace(/\.(\d+)Z$/, (_, digits: string) => `.${digits.padEnd(6, "0")}Z`);
const scoped = (v: Record<string, unknown>, ctx: Context) =>
  v.schoolId === ctx.schoolId && v.userId === ctx.userId && v.role === ctx.role;
export function parseChatInbox(v: unknown, ctx: Context): ChatInbox {
  const invalid = (): never => {
    throw new Error("Contrato de conversas inválido.");
  };
  if (
    !object(v) ||
    !keys(v, ["schoolId", "userId", "role", "threads"]) ||
    !scoped(v, ctx) ||
    !Array.isArray(v.threads) ||
    v.threads.length > 1000
  )
    return invalid();
  const ids = new Set<string>();
  for (const t of v.threads) {
    if (
      !object(t) ||
      !keys(t, ["id", "type", "name", "unread", "peerLeft"]) ||
      !uuid(t.id) ||
      ids.has(t.id) ||
      !["direct", "group"].includes(String(t.type)) ||
      !name(t.name) ||
      typeof t.unread !== "number" ||
      !Number.isSafeInteger(t.unread) ||
      t.unread < 0 ||
      typeof t.peerLeft !== "boolean" ||
      (t.type === "group" && t.peerLeft)
    )
      return invalid();
    ids.add(t.id);
  }
  return v as unknown as ChatInbox;
}
export function parseChatHistory(
  v: unknown,
  ctx: Context,
  conversationId: string,
  before?: ChatCursor,
): ChatHistory {
  const invalid = (): never => {
    throw new Error("Contrato de mensagens inválido.");
  };
  if (
    !object(v) ||
    !keys(v, ["schoolId", "userId", "role", "conversationId", "messages", "next"]) ||
    !scoped(v, ctx) ||
    v.conversationId !== conversationId ||
    !Array.isArray(v.messages) ||
    v.messages.length > 60
  )
    return invalid();
  const ids = new Set<string>();
  let previous: { date: string; id: string } | null = null;
  for (const m of v.messages) {
    if (
      !object(m) ||
      !keys(m, [
        "id",
        "senderId",
        "senderName",
        "body",
        "createdAt",
        "deleted",
        "status",
        "reply",
        "attachment",
      ]) ||
      !uuid(m.id) ||
      ids.has(m.id) ||
      !uuid(m.senderId) ||
      !name(m.senderName) ||
      !body(m.body) ||
      !timestamp(m.createdAt) ||
      typeof m.deleted !== "boolean" ||
      !["sent", "read"].includes(String(m.status)) ||
      (m.deleted && (m.body !== "" || m.attachment !== null || m.reply !== null))
    )
      return invalid();
    if (
      previous &&
      (timeKey(m.createdAt) < timeKey(previous.date) ||
        (timeKey(m.createdAt) === timeKey(previous.date) && m.id <= previous.id))
    )
      return invalid();
    if (
      before &&
      (timeKey(m.createdAt) > timeKey(before.date) ||
        (timeKey(m.createdAt) === timeKey(before.date) && m.id >= before.id))
    )
      return invalid();
    if (
      m.reply !== null &&
      (!object(m.reply) ||
        !keys(m.reply, ["id", "body", "senderName"]) ||
        !uuid(m.reply.id) ||
        !body(m.reply.body) ||
        !name(m.reply.senderName))
    )
      return invalid();
    if (
      m.attachment !== null &&
      (!object(m.attachment) ||
        !keys(m.attachment, ["id", "name"]) ||
        !uuid(m.attachment.id) ||
        !name(m.attachment.name))
    )
      return invalid();
    ids.add(m.id);
    previous = { date: m.createdAt, id: m.id };
  }
  if (v.next !== null) {
    if (
      !object(v.next) ||
      !keys(v.next, ["date", "id"]) ||
      !timestamp(v.next.date) ||
      !uuid(v.next.id) ||
      v.messages.length !== 60 ||
      v.next.id !== v.messages[0].id ||
      v.next.date !== v.messages[0].createdAt
    )
      return invalid();
  }
  return v as unknown as ChatHistory;
}

export type ChatCommand =
  | { type: "start"; peerId: string }
  | { type: "send"; conversationId: string; body: string; replyTo?: string }
  | { type: "delete" | "read"; conversationId: string; messageId: string };
export type ChatReceipt = {
  type: ChatCommand["type"];
  conversationId: string;
  messageId: string | null;
};
export function parseChatReceipt(v: unknown, command: ChatCommand): ChatReceipt {
  if (
    !object(v) ||
    !keys(v, ["type", "conversationId", "messageId"]) ||
    v.type !== command.type ||
    !uuid(v.conversationId) ||
    (command.type !== "start" && v.conversationId !== command.conversationId) ||
    (command.type === "start" ? v.messageId !== null : !uuid(v.messageId)) ||
    ((command.type === "read" || command.type === "delete") && v.messageId !== command.messageId)
  )
    throw new Error("Resposta de escrita do chat inválida.");
  return v as unknown as ChatReceipt;
}
