// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

type Handler = { filter: Record<string, string>; callback: (payload: { new: unknown }) => void };
const { handlers, notifyNative, removeChannel } = vi.hoisted(() => ({
  handlers: [] as Handler[],
  notifyNative: vi.fn(async () => true),
  removeChannel: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    channel: () => {
      const channel = {
        on: (_type: string, filter: Record<string, string>, callback: Handler["callback"]) => {
          handlers.push({ filter, callback });
          return channel;
        },
        subscribe: () => channel,
      };
      return channel;
    },
    removeChannel,
  },
}));
vi.mock("@/features/auth/use-current-account", () => ({
  useCurrentAccount: () => ({ id: "u-1", schoolId: "s-1", roles: ["Encarregado"] }),
}));
vi.mock("@/features/messages/chat-server", () => ({
  listChatConversations: async () => ({
    storage: "sga",
    conversations: [{ id: "c-1", peerId: "u-2", name: "Ana Silva", unread: 1, messages: [] }],
  }),
}));
vi.mock("@/lib/desktop-utils", () => ({ isTauriDesktop: () => true, notifyNative }));

import { DesktopNotifications } from "@/components/layout/DesktopNotifications";

const table = (name: string) => handlers.find((h) => h.filter["table"] === name)!;

describe("notificações do sistema na app desktop", () => {
  beforeEach(() => {
    handlers.length = 0;
    notifyNative.mockClear();
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <DesktopNotifications />
      </QueryClientProvider>,
    );
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("subscreve as mensagens do chat (a RLS limita às conversas da conta) e os comunicados desta escola", () => {
    expect(table("siga_chat_messages").filter["event"]).toBe("INSERT");
    expect(table("school_announcements").filter["filter"]).toBe("school_id=eq.s-1");
  });

  it("mensagem recebida em segundo plano: aviso com o remetente, sem o texto", async () => {
    table("siga_chat_messages").callback({
      new: { id: "m-1", conversation_id: "c-1", sender_id: "u-2", body: "segredo" },
    });
    await vi.waitFor(() =>
      expect(notifyNative).toHaveBeenCalledWith("Nova mensagem", "De Ana Silva."),
    );
    expect(JSON.stringify(notifyNative.mock.calls)).not.toContain("segredo");
  });

  it("comunicado: só os que a conta vê na lista, uma vez", async () => {
    const fresh = {
      id: "a-1",
      title: "Reunião de pais",
      status: "sent",
      audience: "all_guardians",
      published_at: new Date().toISOString(),
      created_by: "secretaria-1",
    };
    table("school_announcements").callback({
      new: { ...fresh, id: "a-0", audience: "teaching_staff" },
    });
    table("school_announcements").callback({ new: fresh });
    table("school_announcements").callback({ new: { ...fresh, title: "Editado" } });
    await vi.waitFor(() =>
      expect(notifyNative).toHaveBeenCalledWith("Novo comunicado", "Reunião de pais"),
    );
    expect(notifyNative).toHaveBeenCalledTimes(1);
  });

  it("com a janela à frente não avisa", async () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    table("siga_chat_messages").callback({
      new: { id: "m-2", conversation_id: "c-1", sender_id: "u-2" },
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(notifyNative).not.toHaveBeenCalled();
  });
});
