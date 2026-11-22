import { describe, expect, it } from "vitest";
import {
  askAiInputSchema,
  ingestDocumentInputSchema,
  listConversationsInputSchema,
  updateAiSettingsInputSchema,
  MAX_DOCUMENT_CHARS,
} from "@/features/siga-ai/schemas";

describe("siga-ai schemas", () => {
  it("consulta a base documental por omissão", () => {
    const parsed = askAiInputSchema.parse({ question: "Como preparo um plano de aula?" });
    expect(parsed.useKnowledgeBase).toBe(true);
    expect(parsed.conversationId).toBeUndefined();
  });

  it("recusa perguntas vazias e conversas que não são UUID", () => {
    expect(() => askAiInputSchema.parse({ question: " " })).toThrow();
    expect(() => askAiInputSchema.parse({ question: "olá", conversationId: "1" })).toThrow();
  });

  it("limita o tamanho do documento ingerido", () => {
    expect(() =>
      ingestDocumentInputSchema.parse({
        title: "Regulamento",
        text: "a".repeat(MAX_DOCUMENT_CHARS + 1),
      }),
    ).toThrow();
    expect(
      ingestDocumentInputSchema.parse({ title: "Regulamento", text: "a".repeat(100) }).scope,
    ).toBe("school");
  });

  it("aceita limpar o endpoint com null mas recusa modos inventados", () => {
    expect(updateAiSettingsInputSchema.parse({ endpointUrl: null }).endpointUrl).toBeNull();
    expect(() => updateAiSettingsInputSchema.parse({ mode: "cloud" })).toThrow();
  });

  it("usa 30 conversas por omissão", () => {
    expect(listConversationsInputSchema.parse({}).limit).toBe(30);
  });
});
