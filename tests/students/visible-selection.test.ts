import { describe, expect, it } from "vitest";
import {
  restrictSelectionToVisibleRows,
  visibleSelectedRows,
} from "@/features/students/visible-selection";

const allRows = [
  { id: "a", full_name: "Ana", class_name: "A" },
  { id: "b", full_name: "Bento", class_name: "B" },
  { id: "c", full_name: "Carla", class_name: "A" },
];

describe("alunos: selecção em lote sob os filtros", () => {
  it("não executa uma acção sobre alunos ocultos por pesquisa ou filtros", () => {
    const visibleRows = allRows.filter((row) => row.class_name === "A");
    expect(visibleSelectedRows(visibleRows, ["a", "b"])).toEqual([allRows[0]]);
    expect(restrictSelectionToVisibleRows(["a", "b"], visibleRows)).toEqual(["a"]);
  });

  it("preserva a selecção entre páginas, mas remove IDs não visíveis", () => {
    expect(visibleSelectedRows(allRows, ["c", "a"])).toEqual([allRows[0], allRows[2]]);
    expect(restrictSelectionToVisibleRows(["c", "a", "missing"], allRows)).toEqual(["c", "a"]);
  });

  it("aceita selecção vazia, filtros vazios e dados actualizados", () => {
    expect(visibleSelectedRows([], ["a"])).toEqual([]);
    expect(restrictSelectionToVisibleRows(["a"], [])).toEqual([]);
    expect(visibleSelectedRows(allRows, [])).toEqual([]);
  });
});
