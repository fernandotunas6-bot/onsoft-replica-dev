import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { assertGradesNotLocked } from "@/features/academic/sga-grades";

/** Base simulada: devolve as pautas dadas para qualquer consulta a grade_sheets. */
function fakeDb(sheets: Array<{ kind: string; term_id: string | null; status: string }>) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    in: (_col: string, statuses: string[]) =>
      Promise.resolve({ data: sheets.filter((s) => statuses.includes(s.status)), error: null }),
  };
  return { from: () => chain } as never;
}

describe("notas bloqueadas com a pauta oficial", () => {
  it("deixa lançar com a pauta em rascunho ou rectificação", async () => {
    await expect(
      assertGradesNotLocked(
        fakeDb([{ kind: "term", term_id: "t1", status: "rectified" }]),
        "s",
        "g",
        "t1",
      ),
    ).resolves.toBeUndefined();
  });

  it("recusa com a pauta do período publicada, e explica o caminho", async () => {
    await expect(
      assertGradesNotLocked(
        fakeDb([{ kind: "term", term_id: "t1", status: "published" }]),
        "s",
        "g",
        "t1",
      ),
    ).rejects.toThrow(/publicada.*Peça a alteração/);
  });

  it("a pauta de outro período não bloqueia; a anual homologada bloqueia todos", async () => {
    await expect(
      assertGradesNotLocked(
        fakeDb([{ kind: "term", term_id: "t2", status: "closed" }]),
        "s",
        "g",
        "t1",
      ),
    ).resolves.toBeUndefined();
    await expect(
      assertGradesNotLocked(
        fakeDb([{ kind: "annual", term_id: null, status: "homologated" }]),
        "s",
        "g",
        "t1",
      ),
    ).rejects.toThrow(/homologada/);
  });

  it("os dois caminhos de lançamento verificam o bloqueio", () => {
    const source = readFileSync("src/features/academic/sga-grades.ts", "utf8");
    expect(source.match(/await assertGradesNotLocked\(/g)).toHaveLength(2);
  });
});
