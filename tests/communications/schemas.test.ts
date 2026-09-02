import { describe, expect, it } from "vitest";
import {
  announcementAudienceOptions,
  announcementChannelOptions,
  archiveAnnouncementInputSchema,
  createAnnouncementInputSchema,
  updateAnnouncementInputSchema,
  updateAnnouncementStatusInputSchema,
} from "@/features/communications/schemas";

describe("communications schemas", () => {
  it("audience options match the DB constraint exactly", () => {
    // These must match public.school_announcements CHECK constraint
    expect(announcementAudienceOptions).toContain("all_guardians");
    expect(announcementAudienceOptions).toContain("guardians_with_debt");
    expect(announcementAudienceOptions).toContain("students_secondary");
    expect(announcementAudienceOptions).toContain("students_finalists");
    expect(announcementAudienceOptions).toContain("teaching_staff");
    // 'school' must NOT be present — it is not in the DB CHECK constraint
    expect(announcementAudienceOptions).not.toContain("school");
  });

  it("channel options match the DB constraint exactly", () => {
    expect(announcementChannelOptions).toEqual(["sms", "email", "portal"]);
  });

  it("accepts a sent announcement with valid audience", () => {
    const parsed = createAnnouncementInputSchema.parse({
      title: "Reunião de encarregados",
      body: "Encontro no sábado às 09:00.",
      audience: "all_guardians",
      channel: "sms",
      status: "sent",
    });
    expect(parsed.status).toBe("sent");
    expect(parsed.audience).toBe("all_guardians");
  });

  it("rejects legacy 'school' audience value that is not in DB", () => {
    const result = createAnnouncementInputSchema.safeParse({
      title: "Teste",
      body: "Mensagem de teste.",
      audience: "school",
      channel: "portal",
      status: "draft",
    });
    expect(result.success).toBe(false);
  });

  it("accepts each valid audience", () => {
    for (const audience of announcementAudienceOptions) {
      const result = createAnnouncementInputSchema.safeParse({
        title: `Aviso para ${audience}`,
        body: "Mensagem de aviso importante.",
        audience,
        channel: "portal",
        status: "draft",
      });
      expect(result.success, `audience '${audience}' should be valid`).toBe(true);
    }
  });

  it("requires schedule date when status is scheduled", () => {
    const result = createAnnouncementInputSchema.safeParse({
      title: "Aviso de propinas",
      body: "Regularize até sexta-feira.",
      audience: "guardians_with_debt",
      channel: "email",
      status: "scheduled",
    });
    expect(result.success).toBe(false);
  });

  it("accepts scheduled announcement with date", () => {
    const parsed = createAnnouncementInputSchema.parse({
      title: "Aviso de propinas",
      body: "Regularize até sexta-feira.",
      audience: "guardians_with_debt",
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
