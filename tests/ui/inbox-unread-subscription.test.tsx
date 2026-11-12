// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useInboxUnread } from "@/features/messages/use-inbox-unread";

const state = vi.hoisted(() => ({
  id: "user-A",
  list: vi.fn(),
  channel: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@/features/auth/use-current-account", () => ({
  useCurrentAccount: () => ({ id: state.id }),
}));
vi.mock("@/features/messages/chat-server", () => ({ listChatConversations: state.list }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { channel: state.channel, removeChannel: state.remove },
}));

function fakeChannel(name: string) {
  const listeners: Array<{ filter: Record<string, string>; callback: () => void }> = [];
  const channel = {
    name,
    listeners,
    on: vi.fn((_type: string, filter: Record<string, string>, callback: () => void) => {
      listeners.push({ filter, callback });
      return channel;
    }),
    subscribe: vi.fn(() => channel),
    emit(table = "siga_chat_messages") {
      for (const listener of listeners) if (listener.filter.table === table) listener.callback();
    },
  };
  return channel;
}
let client: QueryClient;
let channels: ReturnType<typeof fakeChannel>[];
const extraClients: QueryClient[] = [];
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
async function tick(ms = 0) {
  await act(() => vi.advanceTimersByTimeAsync(ms));
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  state.id = "user-A";
  state.list.mockResolvedValue({ conversations: [] });
  state.remove.mockResolvedValue("ok");
  channels = [];
  state.channel.mockImplementation((name: string) => {
    const created = fakeChannel(name);
    channels.push(created);
    return created;
  });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => {
  cleanup();
  client.clear();
  extraClients.splice(0).forEach((item) => item.clear());
  vi.useRealTimers();
});

it("três consumidores partilham um canal e uma leitura inicial", async () => {
  const one = renderHook(useInboxUnread, { wrapper });
  renderHook(useInboxUnread, { wrapper });
  renderHook(useInboxUnread, { wrapper });
  await tick();
  expect(state.channel).toHaveBeenCalledTimes(1);
  expect(state.list).toHaveBeenCalledTimes(1);
  expect(one.result.current.unreadCount).toBe(0);
  expect(channels[0].listeners.map(({ filter }) => filter)).toEqual([
    { event: "INSERT", schema: "public", table: "siga_chat_messages" },
    { event: "UPDATE", schema: "public", table: "siga_chat_members", filter: "user_id=eq.user-A" },
  ]);
});
it("só o último consumidor fecha o canal e cancela eventos pendentes", async () => {
  const one = renderHook(useInboxUnread, { wrapper });
  const two = renderHook(useInboxUnread, { wrapper });
  await tick();
  one.unmount();
  expect(state.remove).not.toHaveBeenCalled();
  channels[0].emit("siga_chat_members");
  await tick(300);
  expect(state.list).toHaveBeenCalledTimes(2);
  channels[0].emit();
  two.unmount();
  expect(state.remove).toHaveBeenCalledTimes(1);
  channels[0].emit();
  await tick(1000);
  expect(state.list).toHaveBeenCalledTimes(2);
});
it("uma resposta actualizada chega aos três consumidores do resumo", async () => {
  const observers = Array.from({ length: 3 }, () => renderHook(useInboxUnread, { wrapper }));
  await tick();
  state.list.mockResolvedValueOnce({
    conversations: [
      {
        id: "thread-A",
        peerId: "peer-A",
        name: "Colega",
        avatarUrl: null,
        unread: 2,
        messages: [{ ts: 1, text: "Mensagem nova" }],
      },
    ],
  });
  channels[0].emit();
  await tick(301);
  expect(observers.map(({ result }) => result.current.unreadCount)).toEqual([1, 1, 1]);
  for (const { result } of observers) {
    expect(result.current.unread[0]).toMatchObject({ conversationId: "thread-A", unread: 2 });
    expect(result.current.lastBodyByPeer.get("peer-A")).toBe("Mensagem nova");
  }
  expect(state.list).toHaveBeenCalledTimes(2);
});
it("junta 500 eventos e conserva uma leitura final durante um pedido lento", async () => {
  renderHook(useInboxUnread, { wrapper });
  renderHook(useInboxUnread, { wrapper });
  await tick();
  let finish = () => {};
  state.list.mockImplementationOnce(
    () =>
      new Promise<{ conversations: [] }>((resolve) => {
        finish = () => resolve({ conversations: [] });
      }),
  );
  for (let index = 0; index < 500; index++) channels[0].emit();
  await tick(300);
  expect(state.list).toHaveBeenCalledTimes(2);
  for (let index = 0; index < 500; index++) channels[0].emit();
  await tick(900);
  expect(state.list).toHaveBeenCalledTimes(2);
  await act(async () => {
    finish();
  });
  await tick(300);
  expect(state.list).toHaveBeenCalledTimes(3);
});
it("mudar de conta remove o canal anterior e aplica o filtro novo", async () => {
  const hook = renderHook(useInboxUnread, { wrapper });
  await tick();
  state.id = "user-B";
  hook.rerender();
  await tick();
  expect(state.remove).toHaveBeenCalledWith(channels[0]);
  expect(channels).toHaveLength(2);
  expect(channels[1].listeners[1].filter.filter).toBe("user_id=eq.user-B");
  const count = state.list.mock.calls.length;
  channels[0].emit();
  await tick(300);
  expect(state.list).toHaveBeenCalledTimes(count);
  channels[1].emit();
  await tick(300);
  expect(state.list).toHaveBeenCalledTimes(count + 1);
});
it("caches distintas não partilham a subscrição nem a invalidação", async () => {
  renderHook(useInboxUnread, { wrapper });
  const other = new QueryClient();
  extraClients.push(other);
  const invalidateFirst = vi.spyOn(client, "invalidateQueries");
  const invalidateOther = vi.spyOn(other, "invalidateQueries");
  renderHook(useInboxUnread, {
    wrapper: ({ children }) => <QueryClientProvider client={other}>{children}</QueryClientProvider>,
  });
  await tick();
  expect(channels).toHaveLength(2);
  expect(channels[0].name).not.toBe(channels[1].name);
  channels[0].emit();
  await tick(300);
  expect(invalidateFirst).toHaveBeenCalledTimes(1);
  expect(invalidateOther).not.toHaveBeenCalled();
});
it("uma remontagem StrictMode não reutiliza o canal ainda em remoção", async () => {
  state.remove.mockImplementation(() => new Promise(() => {}));
  const hook = renderHook(useInboxUnread, {
    wrapper,
    reactStrictMode: true,
  });
  await tick();
  expect(channels).toHaveLength(2);
  expect(channels[0].name).not.toBe(channels[1].name);
  const count = state.list.mock.calls.length;
  channels[0].emit();
  await tick(300);
  expect(state.list).toHaveBeenCalledTimes(count);
  channels[1].emit();
  await tick(300);
  expect(state.list).toHaveBeenCalledTimes(count + 1);
  hook.unmount();
  expect(state.remove).toHaveBeenCalledTimes(2);
});
it("sem conta não cria canal nem consulta o servidor", async () => {
  state.id = "";
  renderHook(useInboxUnread, { wrapper });
  await tick();
  expect(state.channel).not.toHaveBeenCalled();
  expect(state.list).not.toHaveBeenCalled();
});
