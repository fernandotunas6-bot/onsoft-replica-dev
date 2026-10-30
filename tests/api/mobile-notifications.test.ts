import { beforeEach, describe, expect, it, vi } from "vitest";

/** A rota é o sino do portal: a app recebe e marca os mesmos avisos pessoais. */
const fns = vi.hoisted(() => ({
  listMyNotifications: vi.fn(),
  markMyNotificationsRead: vi.fn(),
  listChatConversations: vi.fn(),
  listSchoolAnnouncements: vi.fn(),
}));
vi.mock("@/features/notifications/personal", () => ({
  listMyNotifications: fns.listMyNotifications,
  markMyNotificationsRead: fns.markMyNotificationsRead,
}));
vi.mock("@/features/messages/chat-server", () => ({
  listChatConversations: fns.listChatConversations,
}));
vi.mock("@/features/communications/server", () => ({
  listSchoolAnnouncements: fns.listSchoolAnnouncements,
}));

type Handler = (ctx: { request: Request }) => Promise<Response>;
async function handlers() {
  const { Route } = await import("@/routes/api/mobile/notifications");
  return (Route.options as unknown as { server: { handlers: Record<string, Handler> } }).server
    .handlers;
}
const URL_ = "https://portal-siga.com/api/mobile/notifications";
const get = (query = "") =>
  new Request(`${URL_}${query}`, { headers: { Authorization: "Bearer t" } });
const post = (body: unknown) =>
  new Request(URL_, {
    method: "POST",
    headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const ID = "00000000-0000-4000-8000-0000000000a1";

beforeEach(() => {
  for (const fn of Object.values(fns)) fn.mockReset();
});

const notice = (id: string, createdAt: string, read = false) => ({
  id,
  title: `Aviso ${id}`,
  body: "Texto",
  eventType: "academic.task.created",
  read,
  createdAt,
  href: null,
});

describe("/api/mobile/notifications", () => {
  it("GET devolve os avisos e o número por ler, tal e qual", async () => {
    const list = {
      items: [
        {
          id: ID,
          title: "Trabalho devolvido",
          body: "Resumo — 15 valores.",
          eventType: "academic.task.returned",
          read: false,
          createdAt: "2026-10-27T08:00:00Z",
          href: "/trabalhos",
        },
      ],
      unread: 1,
    };
    fns.listMyNotifications.mockResolvedValue(list);
    const res = await (await handlers()).GET!({ request: get() });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(list);
  });

  it("POST read marca os indicados; sem ids, todos", async () => {
    fns.markMyNotificationsRead.mockResolvedValue({ ok: true });
    const h = await handlers();
    const one = await h.POST!({ request: post({ action: "read", ids: [ID] }) });
    expect(await one.json()).toEqual({ ok: true });
    expect(fns.markMyNotificationsRead).toHaveBeenLastCalledWith({ data: { ids: [ID] } });
    await h.POST!({ request: post({ action: "read" }) });
    expect(fns.markMyNotificationsRead).toHaveBeenLastCalledWith({ data: {} });
  });

  it("POST sem acção conhecida: 422 e nada é marcado", async () => {
    const h = await handlers();
    for (const body of [{}, { action: "delete" }, null]) {
      const res = await h.POST!({ request: post(body) });
      expect(res.status).toBe(422);
    }
    expect(fns.markMyNotificationsRead).not.toHaveBeenCalled();
  });

  it("sem sessão: 401 como as outras rotas móveis", async () => {
    fns.listMyNotifications.mockRejectedValue(
      Object.assign(new Error("Unauthorized"), { statusCode: 401 }),
    );
    const res = await (await handlers()).GET!({ request: get() });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "SESSION_INVALID" });
  });

  it("pulso: só o que é novo, mensagens por ler e comunicados novos sem o texto", async () => {
    fns.listMyNotifications.mockResolvedValue({
      items: [
        notice("n3", "2026-10-27T10:00:00Z"),
        notice("n2", "2026-10-27T08:00:00Z"),
        notice("n1", "2026-10-26T08:00:00Z", true),
      ],
      unread: 2,
    });
    fns.listChatConversations.mockResolvedValue({
      storage: "sga",
      conversations: [{ unread: 2 }, { unread: 0 }, { unread: 1 }],
    });
    fns.listSchoolAnnouncements.mockResolvedValue([
      {
        id: "a2",
        title: "Reunião",
        body: "Longo…",
        status: "sent",
        published_at: "2026-10-27T09:00:00Z",
      },
      {
        id: "a1",
        title: "Feriado",
        body: "Longo…",
        status: "sent",
        published_at: "2026-10-25T09:00:00Z",
      },
    ]);
    const res = await (
      await handlers()
    ).GET!({
      request: get("?pulse=1&after=2026-10-27T07:00:00Z&announcements_after=2026-10-26T00:00:00Z"),
    });
    expect(await res.json()).toEqual({
      items: [notice("n3", "2026-10-27T10:00:00Z"), notice("n2", "2026-10-27T08:00:00Z")],
      unread: 2,
      chatUnread: 3,
      announcements: [{ id: "a2", title: "Reunião", publishedAt: "2026-10-27T09:00:00Z" }],
    });
    expect(fns.listSchoolAnnouncements).toHaveBeenCalledWith({
      data: { limit: 5, status: "sent" },
    });
  });

  it("pulso sem datas devolve tudo; mensagens e comunicados a falhar não o param", async () => {
    fns.listMyNotifications.mockResolvedValue({
      items: [notice("n1", "2026-10-27T10:00:00Z")],
      unread: 1,
    });
    fns.listChatConversations.mockRejectedValue(new Error("chat em baixo"));
    fns.listSchoolAnnouncements.mockRejectedValue(new Error("comunicados em baixo"));
    const res = await (await handlers()).GET!({ request: get("?pulse=1&after=lixo") });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      items: [notice("n1", "2026-10-27T10:00:00Z")],
      unread: 1,
      chatUnread: null,
      announcements: [],
    });
  });

  it("pulso sem sessão: 401", async () => {
    fns.listMyNotifications.mockRejectedValue(
      Object.assign(new Error("Unauthorized"), { statusCode: 401 }),
    );
    fns.listChatConversations.mockResolvedValue({ storage: "sga", conversations: [] });
    fns.listSchoolAnnouncements.mockResolvedValue([]);
    const res = await (await handlers()).GET!({ request: get("?pulse=1") });
    expect(res.status).toBe(401);
  });
});
