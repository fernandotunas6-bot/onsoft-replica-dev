import { describe, expect, it } from "vitest";
import {
  listChatMessagesInputSchema,
  sendChatMessageInputSchema,
} from "@/features/messages/chat-schemas";
import {
  initialsFromName,
  matchesColleagueQuery,
  RECENT_CONTACT_LIMIT,
} from "@/features/messages/recent-contacts";

describe("mensagens internas", () => {
  it("mostra mais de 4 contactos frequentes", () => {
    expect(RECENT_CONTACT_LIMIT).toBeGreaterThan(4);
  });

  it("gera iniciais a partir do nome", () => {
    expect(initialsFromName("Canguele Valentino")).toBe("CV");
  });

  it("valida o envio de mensagem", () => {
    expect(
      sendChatMessageInputSchema.safeParse({
        conversationId: "33333333-3333-3333-3333-333333333333",
        body: "Bom dia",
      }).success,
    ).toBe(true);
    expect(
      sendChatMessageInputSchema.safeParse({
        conversationId: "33333333-3333-3333-3333-333333333333",
        body: "   ",
      }).success,
    ).toBe(false);
  });

  it("aceita uma mensagem só com anexo (sem texto)", () => {
    expect(
      sendChatMessageInputSchema.safeParse({
        conversationId: "33333333-3333-3333-3333-333333333333",
        attachmentFileId: "22222222-2222-2222-2222-222222222222",
        attachmentFileName: "boletim.pdf",
      }).success,
    ).toBe(true);
  });

  it("rejeita mensagem sem texto e sem anexo", () => {
    expect(
      sendChatMessageInputSchema.safeParse({
        conversationId: "33333333-3333-3333-3333-333333333333",
      }).success,
    ).toBe(false);
  });

  it("exige uma conversa válida", () => {
    expect(listChatMessagesInputSchema.safeParse({ conversationId: "nao-uuid" }).success).toBe(
      false,
    );
  });

  it("pesquisa colegas por nome ou cargo", () => {
    const row = { full_name: "Maria Silva", cargo: "Secretaria" };
    expect(matchesColleagueQuery(row, "maria")).toBe(true);
    expect(matchesColleagueQuery(row, "secret")).toBe(true);
    expect(matchesColleagueQuery(row, "tesouraria")).toBe(false);
  });
});
