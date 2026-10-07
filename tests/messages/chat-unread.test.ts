import { describe, expect, it } from "vitest";
import { summarizeChatUnread } from "@/features/messages/chat-unread";
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
