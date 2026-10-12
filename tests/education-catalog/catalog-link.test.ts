import { describe, expect, it } from "vitest";
import { linkNewSubjectsToCatalog } from "@/features/education-catalog/catalog-link";

type Call = { values: Record<string, unknown>; filters: Array<[string, string, unknown]> };

function fakeDb(error: unknown = null) {
  const calls: Call[] = [];
  const db = {
    from: (table: string) => {
      expect(table).toBe("subjects");
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
});
