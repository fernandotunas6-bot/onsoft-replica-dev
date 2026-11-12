/**
 * Texto para `ilike`/`like` comparado tal como é: `%`, `_` e `\` deixam de ser coringas.
 * Sem isto, um e-mail como «j_silva@…» também apanhava «jxsilva@…».
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
