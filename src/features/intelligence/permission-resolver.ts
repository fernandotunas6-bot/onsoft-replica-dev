import { canReadModule, canWriteModule, type ModuleGrantMap } from "@/features/auth/access-policy";
import type { Suggestion } from "./types";

export function filterSuggestionsByPermission(
  suggestions: Suggestion[],
  role: string,
  grants: ModuleGrantMap,
): Suggestion[] {
  return suggestions.filter((suggestion) =>
    suggestion.requiresWrite
      ? canWriteModule(role, suggestion.module as keyof ModuleGrantMap, grants)
      : canReadModule(role, suggestion.module as keyof ModuleGrantMap, grants),
  );
}
