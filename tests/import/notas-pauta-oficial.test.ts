import { describe, expect, it } from "vitest";
import { notasImporter } from "@/features/import/importers/notas-importer";

/** Auditoria 13, F-02: importar notas não altera uma pauta oficial. */
function cache(lockedSheets: Map<string, string>) {
  return {
    academicYearId: "y1",
    students: [
      { id: "st1", person_id: "p1", student_number: "AUD-1", national_id: null, status: "active" },
    ],
    subjects: [{ id: "sub1", code: "MAT", name: "Matemática" }],
    enrollmentByStudent: new Map([
      [
        "st1",
        {
          id: "e1",
          student_id: "st1",
          class_group_id: "g1",
          academic_year_id: "y1",
          status: "active",
        },
      ],
    ]),
    assignmentByPair: new Map([
      ["g1:sub1", { id: "cs1", class_group_id: "g1", subject_id: "sub1", teacher_id: "t1" }],
    ]),
    termBySequence: new Map([[1, { id: "term1", sequence: 1 }]]),
    gradebookByContext: new Map([
      ["term1:cs1", { id: "gb1", term_id: "term1", class_subject_id: "cs1", class_group_id: "g1" }],
    ]),
    itemsByGradebook: new Map([
      [
        "gb1",
        new Map(
          (["MAC", "NPP", "NPT"] as const).map((code) => [
            code,
            { id: `i-${code}`, gradebook_id: "gb1", code },
          ]),
        ),
      ],
    ]),
    scoreByItemEnrollment: new Map(),
    lockedSheets,
  };
}
const row = {
  processo: "AUD-1",
  disciplina: "MAT",
  periodo: "1º Trimestre",
  mac: "12",
  npp: "13",
  npt: "14",
};

describe("importação de notas e pautas oficiais", () => {
  it("sem pauta oficial, a linha é válida", () => {
    const analysis = notasImporter.analyzeRow(row, cache(new Map()) as never);
    expect(analysis.errors).toEqual([]);
  });

  it("pauta do período homologada → erro", () => {
    const analysis = notasImporter.analyzeRow(
      row,
      cache(new Map([["g1:term1", "homologated"]])) as never,
    );
    expect(analysis.status).toBe("error");
    expect(analysis.errors.join(" ")).toMatch(/já é oficial/);
  });

  it("pauta anual oficial → erro em qualquer período", () => {
    const analysis = notasImporter.analyzeRow(
      row,
      cache(new Map([["g1:annual", "published"]])) as never,
    );
    expect(analysis.status).toBe("error");
  });

  it("pauta oficial de outra turma não afecta", () => {
    const analysis = notasImporter.analyzeRow(
      row,
      cache(new Map([["g2:term1", "closed"]])) as never,
    );
    expect(analysis.errors).toEqual([]);
  });
});
