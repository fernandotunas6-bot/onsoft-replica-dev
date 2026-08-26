import type { AppContext, Suggestion, SuggestionRule } from "./types";

export function generateSuggestions<TSnapshot>(
  context: AppContext,
  snapshot: TSnapshot,
  rules: SuggestionRule<TSnapshot>[],
): Suggestion[] {
  const entityKey = context.focusedEntity
    ? `${context.focusedEntity.type}:${context.focusedEntity.id}`
    : "global";
  return rules
    .map((rule) => rule.evaluate(snapshot, context))
    .filter((suggestion): suggestion is Suggestion => suggestion !== null)
    .map((suggestion) => ({ ...suggestion, id: `${entityKey}:${suggestion.id}` }))
    .sort((a, b) => b.priority - a.priority); // Array.prototype.sort is stable (ES2019+): regras empatadas mantêm a ordem declarada
}
