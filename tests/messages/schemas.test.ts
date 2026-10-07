import { describe, expect, it } from "vitest";
import {
  listDirectThreadInputSchema,
  sendDirectMessageInputSchema,
} from "@/features/messages/schemas";
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
      sendDirectMessageInputSchema.safeParse({
        peerId: "11111111-1111-1111-1111-111111111111",
        body: "Bom dia",
      }).success,
    ).toBe(true);
    expect(
      sendDirectMessageInputSchema.safeParse({
        peerId: "11111111-1111-1111-1111-111111111111",
        body: "   ",
      }).success,
    ).toBe(false);
  });

  it("aceita uma mensagem só com anexo (sem texto)", () => {
    expect(
      sendDirectMessageInputSchema.safeParse({
        peerId: "11111111-1111-1111-1111-111111111111",
        attachmentFileId: "22222222-2222-2222-2222-222222222222",
        attachmentFileName: "boletim.pdf",
      }).success,
    ).toBe(true);
  });

  it("rejeita mensagem sem texto e sem anexo", () => {
    expect(
      sendDirectMessageInputSchema.safeParse({
        peerId: "11111111-1111-1111-1111-111111111111",
      }).success,
    ).toBe(false);
  });

  it("exige um colega válido na conversa", () => {
    expect(listDirectThreadInputSchema.safeParse({ peerId: "nao-uuid" }).success).toBe(false);
  });

  it("pesquisa colegas por nome ou cargo", () => {
    const row = { full_name: "Maria Silva", cargo: "Secretaria" };
    expect(matchesColleagueQuery(row, "maria")).toBe(true);
    expect(matchesColleagueQuery(row, "secret")).toBe(true);
    expect(matchesColleagueQuery(row, "tesouraria")).toBe(false);
  });
});
