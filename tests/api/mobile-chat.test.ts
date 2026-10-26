import { beforeEach, describe, expect, it, vi } from "vitest";

/** A rota passa cada pedido à função do chat do SIGA correspondente. */
const fns = vi.hoisted(() => ({
  listChatContacts: vi.fn(),
  listChatConversations: vi.fn(),
  listChatMessages: vi.fn(),
  markChatRead: vi.fn(),
  sendChatMessage: vi.fn(),
  startDirectConversation: vi.fn(),
}));
vi.mock("@/features/messages/chat-server", () => fns);

type Handler = (ctx: { request: Request }) => Promise<Response>;
async function handlers() {
  const { Route } = await import("@/routes/api/mobile/chat");
  return (Route.options as unknown as { server: { handlers: Record<string, Handler> } }).server
    .handlers;
}
const req = (path: string, init: RequestInit = {}) =>
  new Request(`https://portal-siga.com/api/mobile/chat${path}`, {
    ...init,
    headers: { Authorization: "Bearer t" },
  });

beforeEach(() => {
  for (const fn of Object.values(fns)) fn.mockReset();
});

describe("/api/mobile/chat", () => {
  it("GET: conversas, contactos e mensagens (com as anteriores a uma data)", async () => {
    fns.listChatConversations.mockResolvedValue({ storage: "sga", conversations: [] });
    fns.listChatContacts.mockResolvedValue([]);
    fns.listChatMessages.mockResolvedValue({ messages: [], hasMore: false });
    const h = await handlers();
    expect((await h.GET!({ request: req("") })).status).toBe(200);
    await h.GET!({ request: req("?contacts=1") });
    await h.GET!({ request: req("?conversation_id=c1&before=2026-10-01T10:00:00.000Z") });
    expect(fns.listChatConversations).toHaveBeenCalledTimes(1);
    expect(fns.listChatContacts).toHaveBeenCalledTimes(1);
    expect(fns.listChatMessages).toHaveBeenCalledWith({
      data: { conversationId: "c1", before: "2026-10-01T10:00:00.000Z", limit: 60 },
    });
  });

  it("POST: enviar, marcar como lida e começar conversa; acção desconhecida 422", async () => {
    fns.sendChatMessage.mockResolvedValue({ id: "m1" });
    fns.markChatRead.mockResolvedValue({ ok: true });
    fns.startDirectConversation.mockResolvedValue({ conversationId: "c9" });
    const h = await handlers();
    const post = (body: unknown) =>
      h.POST!({ request: req("", { method: "POST", body: JSON.stringify(body) }) });
    await post({ action: "send", conversation_id: "c1", body: "Bom dia" });
    await post({ action: "read", conversation_id: "c1" });
    const started = await post({ action: "start", peer_id: "u2" });
    expect(await started.json()).toEqual({ conversationId: "c9" });
    expect(fns.sendChatMessage).toHaveBeenCalledWith({
      data: { conversationId: "c1", body: "Bom dia" },
    });
    expect(fns.markChatRead).toHaveBeenCalledWith({ data: { conversationId: "c1" } });
    expect(fns.startDirectConversation).toHaveBeenCalledWith({ data: { peerId: "u2" } });
    expect((await post({ action: "apagar-tudo" })).status).toBe(422);
  });

  it("recusa do SIGA com o texto", async () => {
    fns.startDirectConversation.mockImplementation(async () => {
      throw new Error("Só pode enviar mensagens ao pessoal da escola.");
    });
    const h = await handlers();
    const res = await h.POST!({
      request: req("", {
        method: "POST",
        body: JSON.stringify({ action: "start", peer_id: "u3" }),
      }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "REJECTED",
      message: "Só pode enviar mensagens ao pessoal da escola.",
    });
  });
});
