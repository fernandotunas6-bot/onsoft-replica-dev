import { describe, expect, it } from "vitest";
import {
  isMissingCatalogColumn,
  linkSubjectsToCatalogInputSchema,
  mergeDuplicateSubjectsInputSchema,
  normalizeSubjectNamesInputSchema,
} from "@/features/education-catalog/subject-review-server";
import { GLOBAL_SUBJECTS } from "@/features/education-catalog/data/subjects";
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

  it("o pedido de junção exige a que fica e pelo menos uma a juntar, até 20", () => {
    const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    expect(
      mergeDuplicateSubjectsInputSchema.parse({ keepId: id(1), mergeIds: [id(2)] }),
    ).toBeTruthy();
    expect(() =>
      mergeDuplicateSubjectsInputSchema.parse({ keepId: id(1), mergeIds: [] }),
    ).toThrow();
    expect(() =>
      mergeDuplicateSubjectsInputSchema.parse({
        keepId: id(1),
        mergeIds: Array.from({ length: 21 }, (_, i) => id(i + 2)),
      }),
    ).toThrow();
  });

  it("o pedido de ligação valida os códigos do catálogo", () => {
    const id = "00000000-0000-4000-8000-000000000001";
    expect(linkSubjectsToCatalogInputSchema.parse({ auto: [id] })).toEqual({
      auto: [id],
      manual: [],
    });
    expect(
      linkSubjectsToCatalogInputSchema.parse({ manual: [{ subjectId: id, catalogCode: "MAT" }] }),
    ).toBeTruthy();
    expect(() =>
      linkSubjectsToCatalogInputSchema.parse({ manual: [{ subjectId: id, catalogCode: "mat" }] }),
    ).toThrow();
  });
});

describe("ligação ao catálogo", () => {
  it("todos os códigos do catálogo cabem na restrição da base", () => {
    // CHECK de 20261012120000_subjects_catalog_link.sql.
    const bad = GLOBAL_SUBJECTS.map((x) => x.code).filter(
      (code) => !/^[A-Z][A-Z0-9-]{0,23}$/.test(code),
    );
    expect(bad).toEqual([]);
  });

  it("sugere ligar pelo nome exacto; siglas, letras trocadas e próprias não", () => {
    const review = reviewSubjects(
      [
        s("1", "MAT", "Matemática"),
        s("2", "ING", "Inglês"),
        s("3", "EM", "EM"),
        s("4", "QUI", "Quimca"),
        s("5", "ROB", "Robótica Educativa"),
        { ...s("6", "FIS", "Física"), catalogCode: "FIS" },
      ],
      {},
      "AO",
      true,
    );
    expect(review.linkAvailable).toBe(true);
    expect(review.linked).toBe(1);
    expect(review.toLink.map((l) => [l.id, l.catalogCode])).toEqual([
      ["2", "ING"],
      ["1", "MAT"],
    ]);
    expect(review.unmatched.map((u) => u.id)).toEqual(["5"]);
  });

  it("uma disciplina própria ligada à mão deixa de estar «sem correspondência»", () => {
    const review = reviewSubjects(
      [{ ...s("1", "MATA", "Matemática A"), catalogCode: "MAT" }, s("2", "MAT", "Matemática")],
      {},
      "PT",
      true,
    );
    expect(review.unmatched).toEqual([]);
    // A ligação à mão não as torna duplicadas.
    expect(review.duplicates).toEqual([]);
    expect(review.linked).toBe(1);
  });

  it("reconhece a falta da coluna só quando o erro a nomeia", () => {
    expect(
      isMissingCatalogColumn({
        code: "PGRST204",
        message:
          "Could not find the 'catalog_subject_code' column of 'subjects' in the schema cache",
      }),
    ).toBe(true);
    expect(
      isMissingCatalogColumn({
        code: "42703",
        message: "column subjects.catalog_subject_code does not exist",
      }),
    ).toBe(true);
    expect(isMissingCatalogColumn({ code: "42703", message: "column x does not exist" })).toBe(
      false,
    );
    expect(isMissingCatalogColumn(null)).toBe(false);
  });
});
