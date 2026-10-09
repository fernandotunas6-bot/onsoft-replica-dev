import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatAdapterHandlers } from "@/features/messages/chat-adapter";

const client = vi.hoisted(() => ({
  channel: vi.fn(),
  getChannels: vi.fn(),
  removeChannel: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: client }));
vi.mock("@/features/messages/chat-server", () => ({
  deleteChatMessage: vi.fn(),
  listChatContacts: vi.fn(),
  listChatConversations: vi.fn(),
  listChatMessages: vi.fn(),
  markChatRead: vi.fn(),
  sendChatMessage: vi.fn(),
  startDirectConversation: vi.fn(),
}));

function fakeChannel(topic: string) {
  const listeners: {
    type: string;
    event: string;
    callback: (data: unknown) => void;
  }[] = [];
  const channel = {
    topic: `realtime:${topic}`,
    joining: false,
    on: vi.fn((type: string, filter: { event: string }, callback: (data: unknown) => void) => {
      if (channel.joining) throw new Error("callbacks after subscribe");
      listeners.push({ type, event: filter.event, callback });
      return channel;
    }),
    subscribe: vi.fn(() => {
      channel.joining = true;
      return channel;
    }),
    send: vi.fn(() => Promise.resolve("ok")),
    track: vi.fn(() => Promise.resolve("ok")),
    presenceState: vi.fn(() => ({ peer: [] })),
    emit(type: string, event: string, data: unknown) {
      for (const listener of listeners) {
        if (listener.type === type && listener.event === event) listener.callback(data);
      }
    },
  };
  return channel;
}
function handlers(): ChatAdapterHandlers {
  return {
    onMessage: vi.fn(),
    onUpdate: vi.fn(),
    onRead: vi.fn(),
    onTyping: vi.fn(),
    onPresence: vi.fn(),
  };
}
async function settle() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

describe("chat realtime lifecycle", () => {
  let channels: ReturnType<typeof fakeChannel>[];
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    channels = [];
    client.getChannels.mockImplementation(() => channels);
    client.channel.mockImplementation((topic: string) => {
      const existing = channels.find((item) => item.topic === `realtime:${topic}`);
      if (existing) return existing;
      const created = fakeChannel(topic);
      channels.push(created);
      return created;
    });
    client.removeChannel.mockImplementation(async (removed: ReturnType<typeof fakeChannel>) => {
      channels = channels.filter((item) => item !== removed);
      return "ok";
    });
  });

  it("waits for pending removal before a StrictMode remount registers callbacks", async () => {
    const { createSigaChatAdapter } = await import("@/features/messages/chat-adapter");
    const adapter = createSigaChatAdapter({ id: "me", name: "Me" });
    const first = handlers();
    const stop = adapter.subscribe(first);
    await settle();
    const old = channels[0];
    let finishRemoval: (() => void) | undefined;
    client.removeChannel.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          finishRemoval = () => {
            channels = channels.filter((item) => item !== old);
            resolve("ok");
          };
        }),
    );
    stop();
    const next = handlers();
    adapter.subscribe(next);
    await settle();
    expect(client.channel).toHaveBeenCalledTimes(1);
    expect(finishRemoval).toBeDefined();
    finishRemoval!();
    await settle();
    expect(client.channel).toHaveBeenCalledTimes(2);
    expect(channels[0]).not.toBe(old);
    expect(channels[0].on).toHaveBeenCalledTimes(5);
    channels[0].emit("broadcast", "typing", {
      payload: { conversationId: "conversation", userId: "peer" },
    });
    expect(next.onTyping).toHaveBeenCalledWith("conversation");
    expect(first.onTyping).not.toHaveBeenCalled();
  });

  it("shares the common topic and keeps the remaining consumer connected", async () => {
    const { createSigaChatAdapter } = await import("@/features/messages/chat-adapter");
    const one = createSigaChatAdapter({ id: "me", name: "Me" });
    const two = createSigaChatAdapter({ id: "me", name: "Me" });
    const first = handlers();
    const second = handlers();
    const stopOne = one.subscribe(first);
    const stopTwo = two.subscribe(second);
    await settle();
    expect(client.channel).toHaveBeenCalledTimes(1);
    expect(client.channel).toHaveBeenCalledWith("siga-chat", {
      config: { presence: { key: "me" } },
    });
    stopOne();
    stopOne();
    await settle();
    expect(client.removeChannel).not.toHaveBeenCalled();
    channels[0].emit("presence", "sync", {});
    expect(second.onPresence).toHaveBeenCalledWith(["peer"]);
    expect(first.onPresence).not.toHaveBeenCalled();
    two.setTyping("conversation");
    expect(channels[0].send).toHaveBeenCalledWith({
      type: "broadcast",
      event: "typing",
      payload: { conversationId: "conversation", userId: "me" },
    });
    stopTwo();
    await settle();
    expect(client.removeChannel).toHaveBeenCalledTimes(1);
    expect(channels).toHaveLength(0);
  });

  it("does not create a channel for a subscription cancelled before setup", async () => {
    const { createSigaChatAdapter } = await import("@/features/messages/chat-adapter");
    const adapter = createSigaChatAdapter({ id: "me", name: "Me" });
    adapter.subscribe(handlers())();
    await settle();
    expect(client.channel).not.toHaveBeenCalled();
  });

  it("removes a stale HMR channel before creating the replacement", async () => {
    const old = fakeChannel("siga-chat");
    old.subscribe();
    channels.push(old);
    const { createSigaChatAdapter } = await import("@/features/messages/chat-adapter");
    createSigaChatAdapter({ id: "me", name: "Me" }).subscribe(handlers());
    await settle();
    expect(client.removeChannel).toHaveBeenCalledWith(old);
    expect(channels).toHaveLength(1);
    expect(channels[0]).not.toBe(old);
    expect(channels[0].on).toHaveBeenCalledTimes(5);
  });
});
