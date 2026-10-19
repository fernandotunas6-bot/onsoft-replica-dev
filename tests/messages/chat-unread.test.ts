import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ChatConversation } from "@/features/messages/chat-schemas";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/features/messages/chat-server", () => ({ listChatConversations: vi.fn() }));
vi.mock("@/features/auth/use-current-account", () => ({ useCurrentAccount: () => ({}) }));

const { chatUnreadRows } = await import("@/features/messages/use-inbox-unread");

const conv = (id: string, unread: number, ts: number, patch: Partial<ChatConversation> = {}) =>
  ({
    id,
    type: "staff",
    name: `Pessoa ${id}`,
    sub: "",
    peerId: `p-${id}`,
    avatarUrl: null,
    unread,
    messages: [
      {
        id: `last-${id}`,
        ts,
        text: `texto ${id}`,
        from: "x",
        status: "sent",
        deleted: false,
        replyTo: null,
        file: null,
      },
    ],
    ...patch,
  }) as ChatConversation;

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("sino: não lidas vêm do chat", () => {
  it("só conversas com mensagens por ler, a mais recente primeiro, com a conversa", () => {
    const rows = chatUnreadRows([
      conv("a", 0, 30),
      conv("b", 2, 10),
      conv("c", 1, 20),
      conv("g", 4, 5, { type: "group", peerId: null, name: "9.ª A" }),
    ]);
    expect(rows.map((row) => row.conversationId)).toEqual(["c", "b", "g"]);
    expect(rows[0]).toMatchObject({ peerId: "p-c", full_name: "Pessoa c", lastBody: "texto c" });
    expect(rows[2]).toMatchObject({ peerId: null, full_name: "9.ª A", unread: 4 });
  });

  it("mensagem apagada não mostra texto", () => {
    const apagada = conv("d", 1, 1);
    apagada.messages[0]!.deleted = true;
    expect(chatUnreadRows([apagada])[0]!.lastBody).toBe("Mensagem apagada");
  });

  it("ninguém lê nem ouve a tabela antiga de mensagens directas", () => {
    for (const file of [
      "src/features/messages/use-inbox-unread.ts",
      "src/components/layout/DesktopNotifications.tsx",
      "src/features/messages/StaffMessenger.tsx",
    ]) {
      expect(read(file), file).not.toMatch(/table: "siga_direct_messages"|listInboxPreviews/);
    }
    const hook = read("src/features/messages/use-inbox-unread.ts");
    expect(hook).toMatch(/table: "siga_chat_messages"/);
    expect(hook).toMatch(
      /table: "siga_chat_members",\s*filter: `user_id=eq\.\$\{currentUser\.id\}`/,
    );
  });

  it("o sino abre a conversa pelo id (um grupo não tem pessoa)", () => {
    const shell = read("src/components/layout/AppShell.tsx");
    expect(shell).toMatch(/requestOpenConversation\(row\.conversationId\)/);
    const rail = read("src/components/layout/RightRail.tsx");
    expect(rail).toMatch(/if \(detail\.conversationId\) \{\s*open\(detail\.conversationId\);/);
  });
});
