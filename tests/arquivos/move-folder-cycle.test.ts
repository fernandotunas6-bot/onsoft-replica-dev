import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { folderAncestorIds } from "@/features/arquivos/server";

type Row = { id: string; parent_id: string | null; school_id: string };

function fakeDb(rows: Row[]) {
  return {
    from: () => {
      const filters: Record<string, unknown> = {};
      const chain = {
        select: () => chain,
        eq: (column: string, value: unknown) => {
          filters[column] = value;
          return chain;
        },
        maybeSingle: async () => ({
          data:
            rows.find((r) => r.id === filters["id"] && r.school_id === filters["school_id"]) ??
            null,
          error: null,
        }),
      };
      return chain;
    },
  } as never;
}

/** Mover A para dentro de A/B fazia um ciclo e as duas pastas sumiam da árvore. */
describe("mover pastas", () => {
  const rows: Row[] = [
    { id: "A", parent_id: null, school_id: "s" },
    { id: "B", parent_id: "A", school_id: "s" },
    { id: "C", parent_id: "B", school_id: "s" },
  ];

  it("conhece todas as pastas acima do destino", async () => {
    expect([...(await folderAncestorIds(fakeDb(rows), "s", "C"))]).toEqual(["C", "B", "A"]);
  });

  it("um ciclo antigo não prende o pedido", async () => {
    const loop: Row[] = [
      { id: "X", parent_id: "Y", school_id: "s" },
      { id: "Y", parent_id: "X", school_id: "s" },
    ];
    expect([...(await folderAncestorIds(fakeDb(loop), "s", "X"))]).toEqual(["X", "Y"]);
  });

  it("o mover recusa um destino dentro da própria pasta", () => {
    const source = readFileSync("src/features/arquivos/server.ts", "utf8");
    const move = source.slice(source.indexOf("export const moveSchoolFiles"));
    const guard = move.indexOf("folderAncestorIds(db, membership.schoolId, data.parentId)");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(move.indexOf(".update(payload)"));
  });
});
