import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("conversa do chat", () => {
  const source = readFileSync("src/features/messages/chat-server.ts", "utf8");
  const thread = source.slice(
    source.indexOf("export const listChatMessages"),
    source.indexOf("export const sendChatMessage"),
  );

  it("carrega as mensagens mais recentes e mostra-as por ordem cronológica", () => {
    expect(thread).toContain('.order("created_at", { ascending: false })');
    expect(thread).toContain(".slice().reverse()");
  });
});
