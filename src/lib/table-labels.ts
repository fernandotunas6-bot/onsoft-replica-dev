/**
 * Copia o texto de cada cabeçalho para `data-label` nas células da mesma coluna. Com
 * `mobileCards`, o CSS (styles.css) mostra esse rótulo à esquerda de cada valor quando a
 * tabela vira cartões no telemóvel. Células que ocupam várias colunas (estado vazio,
 * "a carregar") ficam sem rótulo.
 */
export function labelTableCells(table: HTMLTableElement) {
  const headRow = table.tHead?.rows[table.tHead.rows.length - 1];
  if (!headRow) return;
  const labels = Array.from(headRow.cells).map((cell) => cell.textContent?.trim() ?? "");
  for (const body of Array.from(table.tBodies)) {
    for (const row of Array.from(body.rows)) {
      let column = 0;
      for (const cell of Array.from(row.cells)) {
        const label = cell.colSpan > 1 ? "" : (labels[column] ?? "");
        if (label) cell.setAttribute("data-label", label);
        else cell.removeAttribute("data-label");
        column += cell.colSpan || 1;
      }
    }
  }
}
