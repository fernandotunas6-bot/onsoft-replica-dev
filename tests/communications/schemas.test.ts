import { describe, expect, it } from "vitest";
import {
  archiveAnnouncementInputSchema,
  createAnnouncementInputSchema,
  updateAnnouncementInputSchema,
  updateAnnouncementStatusInputSchema,
} from "@/features/communications/schemas";

describe("communications schemas", () => {
  it("accepts a sent announcement", () => {
    const parsed = createAnnouncementInputSchema.parse({
      title: "Reunião de encarregados",
      body: "Encontro no sábado às 09:00.",
      audience: "school",
      channel: "sms",
      status: "sent",
    });
    expect(parsed.status).toBe("sent");
  });

  it("requires schedule date when status is scheduled", () => {
    const result = createAnnouncementInputSchema.safeParse({
      title: "Aviso de propinas",
      body: "Regularize até sexta-feira.",
      audience: "school",
      channel: "email",
      status: "scheduled",
    });
    expect(result.success).toBe(false);
  });

  it("accepts scheduled announcement with date", () => {
    const parsed = createAnnouncementInputSchema.parse({
      title: "Aviso de propinas",
      body: "Regularize até sexta-feira.",
      audience: "school",
      channel: "email",
      status: "scheduled",
      scheduledFor: "2025-07-15",
    });
    expect(parsed.scheduledFor).toBe("2025-07-15");
  });

  it("requires schedule date on status updates to scheduled", () => {
    const result = updateAnnouncementStatusInputSchema.safeParse({
      id: "11111111-1111-1111-1111-111111111111",
      status: "scheduled",
    });
    expect(result.success).toBe(false);
  });

  it("exige id, título e corpo para editar", () => {
    expect(updateAnnouncementInputSchema.safeParse({ title: "Aviso" }).success).toBe(false);
    const parsed = updateAnnouncementInputSchema.parse({
      id: "11111111-1111-1111-1111-111111111111",
      title: "Reunião adiada",
      body: "O encontro passa para segunda-feira.",
    });
    expect(parsed.title).toBe("Reunião adiada");
  });

  it("exige o id para arquivar", () => {
    expect(archiveAnnouncementInputSchema.safeParse({}).success).toBe(false);
    expect(
      archiveAnnouncementInputSchema.parse({ id: "11111111-1111-1111-1111-111111111111" }).id,
    ).toHaveLength(36);
  });
});
