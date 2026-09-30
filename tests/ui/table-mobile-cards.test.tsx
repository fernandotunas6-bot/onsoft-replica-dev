// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { labelTableCells } from "@/lib/table-labels";

function table(html: string) {
  const host = document.createElement("div");
  host.innerHTML = `<table>${html}</table>`;
  return host.querySelector("table")!;
}

describe("tabelas em cartões no telemóvel", () => {
  it("cada célula recebe o rótulo da sua coluna", () => {
    const t = table(`
      <thead><tr><th></th><th>Nome</th><th>Estado</th><th>Acções</th></tr></thead>
      <tbody><tr><td><input type="checkbox"></td><td>Ana</td><td>Matriculado</td><td>…</td></tr></tbody>`);
    labelTableCells(t);
    const cells = Array.from(t.tBodies[0]!.rows[0]!.cells);
    expect(cells.map((c) => c.getAttribute("data-label"))).toEqual([
      null,
      "Nome",
      "Estado",
      "Acções",
    ]);
  });

  it("linhas a toda a largura (estado vazio) ficam sem rótulo e as colunas seguintes alinham", () => {
    const t = table(`
      <thead><tr><th>A</th><th>B</th><th>C</th></tr></thead>
      <tbody>
        <tr><td colspan="3">Sem resultados</td></tr>
        <tr><td colspan="2">junta</td><td>3</td></tr>
      </tbody>`);
    labelTableCells(t);
    const [empty, merged] = Array.from(t.tBodies[0]!.rows);
    expect(empty!.cells[0]!.hasAttribute("data-label")).toBe(false);
    expect(merged!.cells[1]!.getAttribute("data-label")).toBe("C");
  });
});
