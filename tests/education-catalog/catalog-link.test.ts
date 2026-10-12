import { describe, expect, it } from "vitest";
import {
  linkNewProgramsToCatalog,
  linkNewSubjectsToCatalog,
} from "@/features/education-catalog/catalog-link";
import { GLOBAL_COURSES } from "@/features/education-catalog/data/courses";

type Call = { values: Record<string, unknown>; filters: Array<[string, string, unknown]> };

function fakeDb(error: unknown = null, expectedTable = "subjects") {
  const calls: Call[] = [];
  const db = {
    from: (table: string) => {
      expect(table).toBe(expectedTable);
      return {
        update: (values: Record<string, unknown>) => {
          const call: Call = { values, filters: [] };
          calls.push(call);
          const q = {
            eq: (c: string, v: unknown) => (call.filters.push(["eq", c, v]), q),
            in: (c: string, v: unknown[]) => (call.filters.push(["in", c, v]), q),
            is: (c: string, v: null) => (call.filters.push(["is", c, v]), q),
            select: async () => ({
              data: error
                ? null
                : (call.filters.find((f) => f[0] === "in")![2] as string[]).map((id) => ({ id })),
              error,
            }),
          };
          return q;
        },
      };
    },
  };
  return { db, calls };
}

describe("ligar ao catálogo ao criar", () => {
  it("liga pelo nome exacto, por disciplina do catálogo, só as por ligar", async () => {
    const { db, calls } = fakeDb();
    const linked = await linkNewSubjectsToCatalog(db, "s1", [
      { id: "a", name: "Matemática" },
      { id: "b", name: "Matematica" },
      { id: "c", name: "Inglês" },
      { id: "d", name: "MAT" },
      { id: "e", name: "Robótica Educativa" },
    ]);
    expect(linked).toBe(3);
    expect(calls.map((c) => c.values)).toEqual([
      { catalog_subject_code: "MAT" },
      { catalog_subject_code: "ING" },
    ]);
    expect(calls[0]!.filters).toEqual([
      ["eq", "school_id", "s1"],
      ["in", "id", ["a", "b"]],
      ["is", "catalog_subject_code", null],
    ]);
  });

  it("sem a coluna (migração por aplicar) não liga e não falha", async () => {
    const { db } = fakeDb({ code: "PGRST204", message: "catalog_subject_code" });
    await expect(
      linkNewSubjectsToCatalog(db, "s1", [{ id: "a", name: "Matemática" }]),
    ).resolves.toBe(0);
    await expect(
      linkNewSubjectsToCatalog({ from: () => ({}) }, "s1", [{ id: "a", name: "Matemática" }]),
    ).resolves.toBe(0);
    await expect(
      linkNewSubjectsToCatalog(
        {
          from: () => {
            throw new Error("x");
          },
        },
        "s1",
        [{ id: "a", name: "Matemática" }],
      ),
    ).resolves.toBe(0);
  });

  it("liga os cursos pelo nome ou sinónimo, dentro do nível; siglas não", async () => {
    const { db, calls } = fakeDb(null, "programs");
    const linked = await linkNewProgramsToCatalog(
      db,
      "s1",
      [
        { id: "a", name: "Ciências Económico-Jurídicas" },
        { id: "b", name: "Enfermagem" },
        { id: "c", name: "CFB" },
      ],
      "school",
    );
    // No ensino não superior, «Enfermagem» é o curso técnico.
    expect(linked).toBe(2);
    expect(calls.map((c) => c.values)).toEqual([
      { catalog_course_code: "SEC-CEJ" },
      { catalog_course_code: "TEC-ENF" },
    ]);
    expect(calls[0]!.filters[2]).toEqual(["is", "catalog_course_code", null]);
  });

  it("sem saber o nível, um nome de dois cursos não liga", async () => {
    const { db, calls } = fakeDb(null, "programs");
    expect(await linkNewProgramsToCatalog(db, "s1", [{ id: "b", name: "Enfermagem" }], null)).toBe(
      0,
    );
    expect(calls).toEqual([]);
  });

  it("todos os códigos de curso cabem na restrição da base", () => {
    const bad = GLOBAL_COURSES.map((c) => c.code).filter(
      (code) => !/^[A-Z][A-Z0-9-]{0,23}$/.test(code),
    );
    expect(bad).toEqual([]);
  });
});
