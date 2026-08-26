import type { RelationEdge, RelationMap } from "./types";

export function applyRelationMap<TSnapshot>(
  map: RelationMap<TSnapshot>,
  snapshot: TSnapshot,
): RelationEdge[] {
  return map.map((definition) => ({
    key: definition.key,
    label: definition.label,
    module: definition.module,
    ...definition.resolve(snapshot),
  }));
}
