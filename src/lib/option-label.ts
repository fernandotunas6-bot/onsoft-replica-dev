/**
 * Formulários que só aceitam opções em texto: o rótulo leva o início do id para
 * duas opções com o mesmo nome não se confundirem, e o id volta pela posição.
 * Onde o formulário aceita `{ value, label }`, preferir isso (o valor é o id).
 */
export function optionLabel(id: string, label: string) {
  return `${label} · ${id.slice(0, 8)}`;
}

export function resolveOptionId(options: string[], selected: string | undefined, ids: string[]) {
  const index = options.indexOf(selected ?? "");
  return index >= 0 ? ids[index] : undefined;
}

/**
 * Rótulos de opção sem o pedaço do id, salvo quando dois nomes coincidem (antes ia em
 * todos: «Turma A · 3f2e79f0»). Ficam únicos, por isso `resolveOptionId` continua a
 * achar o id pela posição.
 */
export function distinctOptionLabels<T extends { id: string }>(
  items: readonly T[],
  label: (item: T) => string,
): string[] {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(label(item), (counts.get(label(item)) ?? 0) + 1);
  return items.map((item) => {
    const text = label(item);
    return (counts.get(text) ?? 0) > 1 ? optionLabel(item.id, text) : text;
  });
}

/** O mesmo, em opções `{ value: id, label }` para formulários que as aceitam. */
export function idOptions<T extends { id: string }>(
  items: readonly T[],
  label: (item: T) => string,
): Array<{ value: string; label: string }> {
  const labels = distinctOptionLabels(items, label);
  return items.map((item, index) => ({ value: item.id, label: labels[index]! }));
}
