import { describe, expect, it } from "vitest";
import {
  alumniAnnouncementAudienceOptions,
  announcementAudienceOptions,
  announcementChannelOptions,
  archiveAnnouncementInputSchema,
  createAnnouncementInputSchema,
  updateAnnouncementInputSchema,
  updateAnnouncementStatusInputSchema,
} from "@/features/communications/schemas";

describe("communications schemas", () => {
  it("audience options match the DB constraint including Alumni", () => {
    expect(announcementAudienceOptions).toContain("all_guardians");
    expect(announcementAudienceOptions).toContain("guardians_with_debt");
    expect(announcementAudienceOptions).toContain("students_secondary");
    expect(announcementAudienceOptions).toContain("students_finalists");
    expect(announcementAudienceOptions).toContain("teaching_staff");
    expect(announcementAudienceOptions).toContain("alumni_all");
    expect(announcementAudienceOptions).toContain("alumni_opportunities");
    expect(announcementAudienceOptions).toContain("alumni_events");
    expect(announcementAudienceOptions).toContain("alumni_mentoring");
    expect(announcementAudienceOptions).toContain("alumni_surveys");
    expect(announcementAudienceOptions).toContain("alumni_fundraising");
    expect(announcementAudienceOptions).not.toContain("school");
  });

  it("keeps Alumni segments as a strict subset of announcement audiences", () => {
    expect(alumniAnnouncementAudienceOptions).toEqual([
      "alumni_all",
      "alumni_opportunities",
      "alumni_events",
      "alumni_mentoring",
      "alumni_surveys",
      "alumni_fundraising",
    ]);
    for (const audience of alumniAnnouncementAudienceOptions) {
      expect(announcementAudienceOptions).toContain(audience);
    }
  });

  it("channel options match the DB constraint exactly", () => {
    expect(announcementChannelOptions).toEqual(["sms", "whatsapp", "email", "portal"]);
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

  it("accepts Alumni purpose-specific announcements", () => {
    const parsed = createAnnouncementInputSchema.parse({
      title: "Novas bolsas para Alumni",
      body: "Consulte as oportunidades disponíveis no Portal Alumni.",
      audience: "alumni_opportunities",
      channel: "email",
      status: "draft",
    });
    expect(parsed.audience).toBe("alumni_opportunities");
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
      // Portal: um agendado por e-mail ficava «Enviado» sem sair (auditoria 13, F-36).
      channel: "portal",
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
