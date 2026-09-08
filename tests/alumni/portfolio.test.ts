import { describe, expect, it } from "vitest";
import { portfolioItemSchema } from "@/features/alumni/portfolio";

describe("alumni portfolio schema", () => {
  it("accepts a professional project with education level", () => {
    const parsed = portfolioItemSchema.parse({
      itemType: "project",
      educationLevel: "higher",
      title: "Plataforma de Gestão Escolar",
      summary: "Projecto aplicado em contexto profissional.",
      skills: ["TypeScript", "PostgreSQL"],
      tags: ["SaaS"],
      externalUrl: "https://example.com/project",
      visibility: "alumni",
      featured: true,
    });
    expect(parsed.itemType).toBe("project");
    expect(parsed.educationLevel).toBe("higher");
    expect(parsed.featured).toBe(true);
  });

  it.each(["primary", "middle", "higher"] as const)("accepts education level %s", (educationLevel) => {
    const parsed = portfolioItemSchema.parse({ itemType: "project", educationLevel, title: "Projecto escolar" });
    expect(parsed.educationLevel).toBe(educationLevel);
  });

  it("rejects unknown education levels", () => {
    expect(portfolioItemSchema.safeParse({ itemType: "project", educationLevel: "secondary", title: "Projecto escolar" }).success).toBe(false);
  });

  it("keeps legacy items without education level valid", () => {
    expect(portfolioItemSchema.safeParse({ itemType: "project", title: "Projecto antigo" }).success).toBe(true);
  });

  it("rejects an end date before the start date", () => {
    const result = portfolioItemSchema.safeParse({
      itemType: "award",
      title: "Prémio",
      startedOn: "2026-09-07",
      endedOn: "2026-09-06",
    });
    expect(result.success).toBe(false);
  });

  it("normalises empty urls to null", () => {
    const parsed = portfolioItemSchema.parse({ itemType: "link", title: "Perfil", externalUrl: "", imageUrl: "" });
    expect(parsed.externalUrl).toBeNull();
    expect(parsed.imageUrl).toBeNull();
  });
});
