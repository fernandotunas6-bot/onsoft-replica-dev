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
