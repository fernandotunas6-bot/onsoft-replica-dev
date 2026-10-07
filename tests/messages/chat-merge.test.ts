import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  chatErrorText,
  mergeConversations,
  withLocalMessages,
} from "@/features/messages/chat-merge";
import type { ChatConversation, ChatMessage } from "@/features/messages/chat-schemas";

const msg = (id: string, ts: number, patch: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  ts,
  text: id,
  from: "me",
  status: "sent",
  deleted: false,
  replyTo: null,
  file: null,
  ...patch,
});

const conv = (id: string, patch: Partial<ChatConversation> = {}): ChatConversation => ({
  id,
  type: "staff",
  name: id,
  sub: "Equipa",
  peerId: `peer-${id}`,
  avatarUrl: null,
  unread: 0,
  messages: [],
  loaded: false,
  ...patch,
});

describe("chat: recarregar a lista não apaga o que está aberto", () => {
  it("a conversa carregada mantém o histórico, o 'carregar anteriores' e o que se está a enviar", () => {
    const aberta = conv("a", {
      loaded: true,
      more: true,
      online: true,
      messages: [msg("1", 10), msg("2", 20), msg("tmp", 30, { status: "sending" })],
    });
    const fresh = [conv("a", { unread: 3, messages: [msg("last-a", 20)] })];
    const [merged] = mergeConversations([aberta], fresh, "a");
    expect(merged.messages.map((m) => m.id)).toEqual(["1", "2", "tmp"]);
    expect(merged.more).toBe(true);
    expect(merged.loaded).toBe(true);
    expect(merged.online).toBe(true);
    // A conversa que se está a ler não volta a aparecer como não lida.
    expect(merged.unread).toBe(0);
  });

  it("uma mensagem mais recente do que as carregadas entra no fim", () => {
    const carregada = conv("b", { loaded: true, messages: [msg("1", 10)] });
    const fresh = [conv("b", { unread: 1, messages: [msg("last-b", 50, { from: "Ana" })] })];
    const [merged] = mergeConversations([carregada], fresh, null);
    expect(merged.messages.map((m) => m.id)).toEqual(["1", "last-b"]);
    expect(merged.unread).toBe(1);
  });

  it("conversas nunca abertas vêm do servidor tal como estão; as que desapareceram saem", () => {
    const fresh = [conv("c", { unread: 2, messages: [msg("last-c", 5)] })];
    const merged = mergeConversations([conv("velha", { loaded: true })], fresh, null);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ id: "c", unread: 2, loaded: false });
  });

  it("recarregar a conversa mantém as mensagens ainda a enviar ou falhadas", () => {
    const server = [msg("1", 10), msg("2", 20)];
    const current = [
      msg("1", 10),
      msg("tmp", 30, { status: "sending" }),
      msg("x", 31, { status: "failed" }),
    ];
    expect(withLocalMessages(server, current).map((m) => m.id)).toEqual(["1", "2", "tmp", "x"]);
    expect(withLocalMessages(server, [msg("1", 10)])).toBe(server);
  });

  it("mostra a razão do servidor quando serve à pessoa", () => {
    expect(chatErrorText(new Error("Não pode anexar este ficheiro."), "Falha")).toBe(
      "Não pode anexar este ficheiro.",
    );
    expect(chatErrorText(new Error("Failed to fetch"), "Falha")).toBe("Falha");
    expect(chatErrorText(new Error("CHAT_SCHEMA_MISSING"), "Falha")).toBe("Falha");
    expect(chatErrorText("x", "Falha")).toBe("Falha");
  });
});

describe("chat: servidor", () => {
  const source = readFileSync(join(process.cwd(), "src/features/messages/chat-server.ts"), "utf8");
  const fn = (name: string) => {
    const start = source.indexOf(`export const ${name} = createServerFn`);
    expect(start).toBeGreaterThanOrEqual(0);
    const next = source.indexOf("\nexport ", start + 1);
    return source.slice(start, next < 0 ? undefined : next);
  };

  it("pré-visualização e não lidas por conversa, não das 600 mais recentes de todas", () => {
    const list = fn("listChatConversations");
    expect(list).not.toMatch(/\.limit\(600\)/);
    expect(list).toMatch(/loadConversationSummaries\(/);
    expect(source).toMatch(/count: "exact", head: true/);
    expect(list).toMatch(/peerLeft: !isGroup/);
  });

  it("não se escreve a quem saiu da escola nem numa conversa de outra escola", () => {
    expect(fn("sendChatMessage")).toMatch(/await assertConversationOpen\(/);
    expect(source).toMatch(/já não pertence à escola: a conversa fica só para leitura/);
    expect(source).toMatch(/Esta conversa é de outra escola/);
  });

  it("a mensagem respondida é sempre da mesma conversa", () => {
    expect(fn("listChatMessages")).toMatch(
      /\.eq\("conversation_id", data\.conversationId\)\s*\.in\("id", replyIds\)/,
    );
    expect(fn("sendChatMessage")).toMatch(
      /\.eq\("id", row\.reply_to\)\s*\.eq\("conversation_id", data\.conversationId\)/,
    );
  });

  it("apagar diz quando nada foi apagado e limpa também o nome do anexo", () => {
    const del = fn("deleteChatMessage");
    expect(del).toMatch(/attachment_file_name: null/);
    expect(del).toMatch(/Só pode apagar as suas mensagens/);
  });

  it("o ecrã junta a lista em vez de a substituir e esconde o anexo a quem não tem Arquivos", () => {
    const dock = readFileSync(join(process.cwd(), "src/features/messages/ChatDock.tsx"), "utf8");
    expect(dock).toMatch(/mergeConversations\(prev, fresh, activeRef\.current\)/);
    expect(dock).not.toMatch(/setConvs\(await adapter\.listConversations\(\)\)/);
    expect(dock).toMatch(/withLocalMessages\(result\.messages, c\.messages\)/);
    expect(dock).toMatch(/\{canAttach \? \(/);
    expect(dock).toMatch(/conv\.peerLeft \?/);
  });
});
