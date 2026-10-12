import { describe, expect, it } from "vitest";
import { summarizeAdoption } from "@/features/education-catalog/adoption";

describe("adopção do catálogo pelas escolas", () => {
  it("conta ligadas, reconhecidas pelo nome e próprias, por escola e no total", () => {
    const result = summarizeAdoption({
      linkAvailable: true,
      schools: [
        { id: "s1", name: "Escola A" },
        { id: "s2", name: "Escola B" },
        { id: "s3", name: "Sem nada" },
      ],
      subjects: [
        { id: "1", school_id: "s1", name: "Matemática", catalog_code: "MAT" },
        { id: "2", school_id: "s1", name: "Física", catalog_code: null },
        { id: "3", school_id: "s1", name: "Robótica Educativa" },
        { id: "4", school_id: "s2", name: "EM" },
      ],
      programs: [
        { id: "p1", school_id: "s2", name: "Ciências Económico-Jurídicas" },
        { id: "p2", school_id: "s2", name: "Enfermagem" },
      ],
    });
    expect(result.totals.subjects).toEqual({ total: 4, linked: 1, recognized: 1, own: 2 });
    // «Enfermagem» serve dois cursos: sem o nível não conta como reconhecido.
    expect(result.totals.courses).toEqual({ total: 2, linked: 0, recognized: 1, own: 1 });
    expect(result.schools.map((s) => s.schoolId)).toEqual(["s1", "s2"]);
    expect(result.schools[0]!.subjects).toEqual({ total: 3, linked: 1, recognized: 1, own: 1 });
  });
});
