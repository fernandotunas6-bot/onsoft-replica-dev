import { describe, expect, it } from "vitest";
import { normalizeSubjectNamesInputSchema } from "@/features/education-catalog/subject-review-server";
import { countryFromCurrency, reviewSubjects } from "@/features/education-catalog/subject-review";

const s = (id: string, code: string, name: string) => ({ id, code, name });

describe("revisão das disciplinas da escola", () => {
  const subjects = [
    s("1", "MAT", "Matemática"),
    s("2", "MAT2", "Matematica"),
    s("3", "M", "MAT"),
    s("4", "HIS", "historia"),
    s("5", "QUI", "Quimca"),
    s("6", "ING", "Inglês"),
    s("7", "EM", "EM"),
    s("8", "ROB", "Robótica Educativa"),
    s("9", "FIS", "Física"),
  ];
  const usage = { "1": 3, "2": 5, "3": 0 };
  const review = reviewSubjects(subjects, usage, "AO");

  it("junta num grupo a mesma disciplina e sugere manter a mais usada", () => {
    const mat = review.duplicates.find((d) => d.catalogCode === "MAT")!;
    expect(mat.members.map((m) => m.id).sort()).toEqual(["1", "2", "3"]);
    expect(mat.keepId).toBe("2");
    expect(mat.members.find((m) => m.id === "3")!.ambiguous).toBe(true);
  });

  it("corrige grafia e letras trocadas; sinónimos ficam como estão", () => {
    const byId = Object.fromEntries(review.renames.map((r) => [r.id, r]));
    expect(byId["4"]).toMatchObject({ to: "História", reason: "grafia", preselected: true });
    expect(byId["5"]).toMatchObject({ to: "Química", reason: "letra trocada", preselected: true });
    expect(byId["6"]).toBeUndefined();
    expect(byId["9"]).toBeUndefined();
    // Membros de duplicados não são renomeados.
    expect(byId["2"]).toBeUndefined();
  });

  it("sigla sozinha: sugere, mas não marca por omissão", () => {
    expect(review.renames.find((r) => r.id === "7")).toMatchObject({
      to: "Estudo do Meio",
      reason: "sigla",
      preselected: false,
    });
  });

  it("o que o catálogo não conhece fica como próprio da escola", () => {
    expect(review.unmatched.map((u) => u.name)).toEqual(["Robótica Educativa"]);
    expect(review.total).toBe(9);
    expect(review.matched).toBe(8);
  });

  it("usa o nome do país: «Portugues» → «Português» em Portugal", () => {
    const pt = reviewSubjects([s("1", "PORT", "portugues")], {}, "PT");
    expect(pt.renames[0]).toMatchObject({ to: "Português", reason: "grafia" });
    const ao = reviewSubjects([s("1", "LP", "lingua portuguesa")], {}, "AO");
    expect(ao.renames[0]).toMatchObject({ to: "Língua Portuguesa" });
  });

  it("país pela moeda da escola", () => {
    expect(countryFromCurrency("AOA")).toBe("AO");
    expect(countryFromCurrency("eur")).toBe("PT");
    expect(countryFromCurrency("MZN")).toBe("MZ");
    expect(countryFromCurrency(null)).toBe("AO");
  });

  it("o pedido de correcção só aceita ids", () => {
    expect(() => normalizeSubjectNamesInputSchema.parse({ subjectIds: [] })).toThrow();
    expect(() => normalizeSubjectNamesInputSchema.parse({ subjectIds: ["x"] })).toThrow();
    expect(
      normalizeSubjectNamesInputSchema.parse({
        subjectIds: ["00000000-0000-4000-8000-000000000001"],
      }),
    ).toBeTruthy();
  });
});
