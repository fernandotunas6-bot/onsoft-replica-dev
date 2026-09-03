import { describe, expect, it } from "vitest";
import {
  candidacyProcessNumber,
  decideEnrollmentApplicationInputSchema,
  getPublicEnrollmentFormInputSchema,
  submitPublicEnrollmentInputSchema,
  updateEnrollmentFormInputSchema,
} from "@/features/enrollment/schemas";

describe("enrollment form schemas", () => {
  it("accepts a valid public slug", () => {
    expect(getPublicEnrollmentFormInputSchema.parse({ slug: "escola-matricula" }).slug).toBe(
      "escola-matricula",
    );
  });

  it("rejects an invalid slug", () => {
    expect(getPublicEnrollmentFormInputSchema.safeParse({ slug: "Bad Slug" }).success).toBe(false);
  });

  it("requires a student name on public submit", () => {
    expect(
      submitPublicEnrollmentInputSchema.safeParse({
        slug: "escola-matricula",
        person: { full_name: "A" },
      }).success,
    ).toBe(false);
    expect(
      submitPublicEnrollmentInputSchema.safeParse({
        slug: "escola-matricula",
        person: { full_name: "Ana Domingos" },
      }).success,
    ).toBe(true);
  });

  it("aceita localização na candidatura pública", () => {
    const parsed = submitPublicEnrollmentInputSchema.parse({
      slug: "escola-matricula",
      person: {
        full_name: "Ana Domingos",
        province: "Huambo",
        municipality: "Caála",
        commune: "Cuima",
        address: "Bairro Central",
      },
    });
    expect(parsed.person.province).toBe("Huambo");
    expect(parsed.person.municipality).toBe("Caála");
  });

  it("rejeita NIF/BI inválido na candidatura pública", () => {
    expect(
      submitPublicEnrollmentInputSchema.safeParse({
        slug: "escola-matricula",
        person: { full_name: "Ana Domingos", nif: "INVALID" },
      }).success,
    ).toBe(false);
    expect(
      submitPublicEnrollmentInputSchema.safeParse({
        slug: "escola-matricula",
        person: { full_name: "Ana Domingos", nif: "000204688CA010" },
      }).success,
    ).toBe(true);
  });

  it("requires a hex accent color when updating appearance", () => {
    const id = "11111111-1111-1111-1111-111111111111";
    expect(
      updateEnrollmentFormInputSchema.safeParse({
        id,
        title: "Candidatura",
        accentColor: "blue",
      }).success,
    ).toBe(false);
    expect(
      updateEnrollmentFormInputSchema.parse({
        id,
        title: "Candidatura",
        accentColor: "#1d4ed8",
      }).isOpen,
    ).toBe(true);
  });

  it("gera o número de processo da candidatura aceite", () => {
    expect(candidacyProcessNumber("11111111-1111-4111-8111-111111111111", "2026-08-11")).toBe(
      "CAND-20260811-111111",
    );
  });

  it("aceita a decisão com turma opcional", () => {
    const applicationId = "11111111-1111-4111-8111-111111111111";
    expect(
      decideEnrollmentApplicationInputSchema.parse({
        applicationId,
        decision: "accepted",
      }).classGroupId,
    ).toBeUndefined();
    expect(
      decideEnrollmentApplicationInputSchema.parse({
        applicationId,
        decision: "accepted",
        classGroupId: "22222222-2222-4222-8222-222222222222",
      }).classGroupId,
    ).toBe("22222222-2222-4222-8222-222222222222");
    expect(
      decideEnrollmentApplicationInputSchema.safeParse({
        applicationId,
        decision: "accepted",
        classGroupId: "turma",
      }).success,
    ).toBe(false);
  });
});
