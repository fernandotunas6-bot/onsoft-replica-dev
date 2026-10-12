import { describe, expect, it } from "vitest";
import { linkCoursesToCatalogInputSchema } from "@/features/academic/curriculum-templates-server";
import { catalogCourseOptions, reviewCourses } from "@/features/education-catalog/course-review";

const c = (id: string, code: string, name: string, catalogCode: string | null = null) => ({
  id,
  code,
  name,
  catalogCode,
});

describe("cursos da escola contra o catálogo", () => {
  it("separa ligados, reconhecidos pelo nome e próprios da escola", () => {
    const review = reviewCourses(
      [
        c("1", "CEJ", "Ciências Económico-Jurídicas"),
        c("2", "CFB", "Ciências Físicas e Biológicas", "SEC-CFB"),
        c("3", "ENF", "Enfermagem"),
        c("4", "ART", "Artes Plásticas Experimentais"),
        c("5", "X", "Curso antigo", "NAO-EXISTE"),
      ],
      true,
    );
    expect(review).toMatchObject({ total: 5, linkAvailable: true, linked: 1 });
    expect(review.toLink.map((l) => [l.id, l.catalogCode])).toEqual([["1", "SEC-CEJ"]]);
    // «Enfermagem» serve dois cursos do catálogo: não se adivinha.
    expect(review.unmatched.map((u) => u.id)).toEqual(["4", "5", "3"]);
  });

  it("as opções para ligar à mão dizem o tipo de curso", () => {
    const options = catalogCourseOptions();
    const enf = options.filter((o) => o.label.includes("Enfermagem"));
    expect(enf.length).toBeGreaterThanOrEqual(2);
    expect(new Set(enf.map((o) => o.label)).size).toBe(enf.length);
  });

  it("o pedido valida os códigos", () => {
    const id = "00000000-0000-4000-8000-000000000001";
    expect(
      linkCoursesToCatalogInputSchema.parse({
        manual: [{ programId: id, catalogCode: "LIC-ENF" }],
      }),
    ).toEqual({ auto: [], manual: [{ programId: id, catalogCode: "LIC-ENF" }] });
    expect(() =>
      linkCoursesToCatalogInputSchema.parse({
        manual: [{ programId: id, catalogCode: "lic enf" }],
      }),
    ).toThrow();
  });
});
