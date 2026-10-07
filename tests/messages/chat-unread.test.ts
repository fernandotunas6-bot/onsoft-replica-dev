import { describe, expect, it } from "vitest";
import { planChatUnread, summarizeChatUnread } from "@/features/messages/chat-unread";
import type { ChatConversation, ChatMessage } from "@/features/messages/chat-schemas";

function message(partial: Partial<ChatMessage>): ChatMessage {
  return {
    id: "m",
    ts: 0,
    text: "",
    from: "Ana",
    status: "sent",
    deleted: false,
    replyTo: null,
    file: null,
    ...partial,
  };
}

function conversation(partial: Partial<ChatConversation>): ChatConversation {
  return {
    id: "c",
    type: "staff",
    name: "Ana",
    sub: "Professor",
    peerId: null,
    avatarUrl: null,
    unread: 0,
    messages: [],
    ...partial,
  };
}

describe("resumo das mensagens por ler", () => {
  it("soma as não lidas e ordena da mais recente para a mais antiga", () => {
    const summary = summarizeChatUnread([
      conversation({
        id: "a",
        peerId: "p1",
        unread: 2,
        messages: [message({ ts: 10, text: "Olá" })],
      }),
      conversation({
        id: "b",
        type: "group",
        unread: 1,
        messages: [message({ ts: 20, text: "Reunião" })],
      }),
      conversation({
        id: "c",
        peerId: "p3",
        unread: 0,
        messages: [message({ ts: 30, text: "Lida" })],
      }),
    ]);
    expect(summary.unreadCount).toBe(3);
    expect(summary.conversations.map((row) => row.id)).toEqual(["b", "a"]);
  });

  it("os pontos por pessoa só contam conversas directas com não lidas", () => {
    const summary = summarizeChatUnread([
      conversation({ id: "a", peerId: "p1", unread: 1 }),
      conversation({ id: "b", type: "group", unread: 4 }),
      conversation({ id: "c", peerId: "p3", unread: 0 }),
    ]);
    expect([...summary.unreadPeerIds]).toEqual(["p1"]);
  });

  it("a última mensagem diz quem escreveu e quando foi apagada", () => {
    const summary = summarizeChatUnread([
      conversation({ peerId: "p1", messages: [message({ from: "me", text: "Já enviei" })] }),
      conversation({ id: "d", peerId: "p2", messages: [message({ deleted: true })] }),
    ]);
    expect(summary.lastTextByPeer.get("p1")).toBe("Você: Já enviei");
    expect(summary.lastTextByPeer.get("p2")).toBe("Mensagem apagada");
  });

  it("um valor negativo vindo do servidor nunca baixa o total", () => {
    expect(summarizeChatUnread([conversation({ unread: -3 })]).unreadCount).toBe(0);
  });
});

describe("plano de contagem do «por ler» (servidor)", () => {
  const row = (conversation_id: string, at: string, sender_id = "outro") => ({
    conversation_id,
    sender_id,
    deleted_at: null,
    created_at: `2026-10-07T${at}:00Z`,
  });

  it("janela sem encher: conta só com ela, sem pedidos extra", () => {
    const plan = planChatUnread({
      rows: [row("a", "10:00"), row("a", "09:00"), row("a", "08:00", "eu")],
      limit: 600,
      conversationIds: ["a", "b"],
      readAtById: new Map([["a", "2026-10-07T08:30:00Z"]]),
      userId: "eu",
    });
    expect(plan.unreadByConv.get("a")).toBe(2);
    expect(plan.needsExactCount.size).toBe(0);
    expect(plan.missingLast).toEqual([]);
  });

  it("janela cheia: conversa lida antes da linha mais antiga pede contagem exacta", () => {
    const plan = planChatUnread({
      rows: [row("a", "10:00"), row("a", "09:00")],
      limit: 2,
      conversationIds: ["a", "b", "c"],
      readAtById: new Map([
        ["a", "2026-10-07T09:30:00Z"], // lida depois do corte: a janela chega
        ["b", "2026-10-07T07:00:00Z"], // lida antes do corte e fora da janela
        ["c", "2026-10-07T11:00:00Z"], // lida há pouco: nada por ler
      ]),
      userId: "eu",
    });
    expect(plan.unreadByConv.get("a")).toBe(1);
    expect([...plan.needsExactCount]).toEqual(["b"]);
    expect(plan.missingLast).toEqual(["b", "c"]);
  });

  it("conversa nunca lida com a janela cheia conta-se toda", () => {
    const plan = planChatUnread({
      rows: [row("a", "10:00")],
      limit: 1,
      conversationIds: ["z"],
      readAtById: new Map([["z", "null"]]),
      userId: "eu",
    });
    expect([...plan.needsExactCount]).toEqual(["z"]);
  });

  it("mensagens próprias e apagadas nunca contam", () => {
    const plan = planChatUnread({
      rows: [row("a", "10:00", "eu"), { ...row("a", "09:00"), deleted_at: "2026-10-07T09:05:00Z" }],
      limit: 600,
      conversationIds: ["a"],
      readAtById: new Map(),
      userId: "eu",
    });
    expect(plan.unreadByConv.get("a")).toBeUndefined();
  });
});
