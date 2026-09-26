/**
 * Primeira frase de uma descrição longa; o resto fica atrás de "Saber mais".
 * Descrições curtas passam inteiras.
 */
export function splitDescription(text: string, limit = 100): { lead: string; rest: string } {
  const clean = text.trim();
  if (clean.length <= limit) return { lead: clean, rest: "" };
  const end = clean.search(/[.!?](\s|$)/);
  if (end === -1 || end + 1 >= clean.length - 1) return { lead: clean, rest: "" };
  return { lead: clean.slice(0, end + 1), rest: clean.slice(end + 1).trim() };
}
