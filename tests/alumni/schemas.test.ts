import { describe, expect, it } from "vitest";
import {
  alumniContributionInputSchema,
  alumniEventInputSchema,
  alumniExperienceInputSchema,
  alumniSurveyInputSchema,
  listAlumniInputSchema,
  mentoringMatchInputSchema,
  upsertAlumniInputSchema,
  upsertAlumniOpportunityInputSchema,
} from "@/features/alumni/schemas";

describe("alumni schemas", () => {
  it("applies safe directory defaults", () => {
    const parsed = listAlumniInputSchema.parse({});
    expect(parsed.query).toBe("");
    expect(parsed.limit).toBe(50);
    expect(parsed.mentoringOnly).toBe(false);
    expect(parsed.opportunitiesOnly).toBe(false);
  });

  it("accepts a complete alumni profile", () => {
    const parsed = upsertAlumniInputSchema.parse({
      studentId: "11111111-1111-4111-8111-111111111111",
      employmentStatus: "employed",
      graduationYear: 2026,
      headline: "Engenheiro e mentor",
      skills: ["TypeScript", "Liderança"],
      availableForMentoring: true,
      directoryVisibility: "alumni",
    });
    expect(parsed.employmentStatus).toBe("employed");
    expect(parsed.skills).toHaveLength(2);
  });

  it("rejects invalid alumni urls", () => {
    expect(() => upsertAlumniInputSchema.parse({
      studentId: "11111111-1111-4111-8111-111111111111",
      linkedinUrl: "linkedin",
    })).toThrow();
  });

  it("validates professional experience", () => {
    const parsed = alumniExperienceInputSchema.parse({
      alumniId: "22222222-2222-4222-8222-222222222222",
      kind: "employment",
      organization: "SIGA Labs",
      title: "Product Engineer",
      isCurrent: true,
    });
    expect(parsed.kind).toBe("employment");
  });

  it("validates opportunity publishing", () => {
    const parsed = upsertAlumniOpportunityInputSchema.parse({
      title: "Bolsa de Pós-Graduação",
      opportunityType: "scholarship",
      status: "published",
      remoteAllowed: false,
    });
    expect(parsed.status).toBe("published");
  });

  it("rejects self mentoring", () => {
    const id = "33333333-3333-4333-8333-333333333333";
    expect(() => mentoringMatchInputSchema.parse({ mentorAlumniId: id, menteeAlumniId: id, focusArea: "Carreira" })).toThrow();
  });

  it("validates alumni events", () => {
    const parsed = alumniEventInputSchema.parse({
      title: "Encontro Alumni 2026",
      startsAt: "2026-10-10T09:00:00.000Z",
      eventType: "reunion",
      status: "published",
    });
    expect(parsed.eventType).toBe("reunion");
  });

  it("validates tracer study schema", () => {
    const parsed = alumniSurveyInputSchema.parse({
      title: "Tracer Study 2026",
      purpose: "tracer_study",
      status: "published",
      schemaJson: [{ id: "employment", label: "Qual é a sua situação profissional?", type: "select", required: true, options: ["Empregado", "Empreendedor", "À procura"] }],
    });
    expect(parsed.schemaJson).toHaveLength(1);
  });

  it("requires value or hours for contributions", () => {
    expect(() => alumniContributionInputSchema.parse({
      alumniId: "44444444-4444-4444-8444-444444444444",
      contributionType: "donation",
    })).toThrow();
    expect(alumniContributionInputSchema.parse({
      alumniId: "44444444-4444-4444-8444-444444444444",
      contributionType: "volunteer_hours",
      hours: 12,
    }).hours).toBe(12);
  });
});
