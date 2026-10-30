/** Uma selecção em lote deve conter apenas linhas elegíveis sob os filtros activos. */
export function visibleSelectedRows<T extends { id: string }>(
  visibleRows: readonly T[],
  selectedIds: readonly string[],
): T[] {
  const selected = new Set(selectedIds);
  return visibleRows.filter((row) => selected.has(row.id));
}

/** Preserva a ordem da selecção e elimina IDs que os filtros já não mostram. */
export function restrictSelectionToVisibleRows(
  previousIds: readonly string[],
  visibleRows: readonly { id: string }[],
): string[] {
  const visible = new Set(visibleRows.map((row) => row.id));
  return previousIds.filter((id) => visible.has(id));
}
