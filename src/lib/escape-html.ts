/**
 * Escapa texto para HTML (corpo e atributos, com aspas simples ou duplas).
 * Havia oito cópias em três versões; três não escapavam a aspa simples.
 */
export function escapeHtml(value: string | null | undefined): string {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
