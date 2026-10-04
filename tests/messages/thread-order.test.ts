import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("conversa directa", () => {
  const source = readFileSync("src/features/messages/server.ts", "utf8");
  const thread = source.slice(
    source.indexOf("export const listDirectThread"),
    source.indexOf("export const sendDirectMessage"),
  );

  it("carrega as mensagens mais recentes e mostra-as por ordem cronológica", () => {
    expect(thread).toContain('.order("created_at", { ascending: false })');
    expect(thread).toContain("[...(rows ?? [])].reverse()");
  });
});
