import type { ModuleGrantMap } from "@/features/auth/access-policy";

export type EntityType = "student" | "teacher" | "class" | "finance-overview" | "dashboard-overview";

export interface EntityFocus<T = unknown> {
  type: EntityType;
  id: string;
  label: string;
  schoolId: string;
  data: T;
}

export interface AppContext {
  userId: string;
  role: string;
  grants: ModuleGrantMap;
  pathname: string;
  focusedEntity: EntityFocus | null;
}

export type RelationStatus = "ok" | "attention" | "critical" | "empty";

export interface RelationEdge {
  key: string;
  label: string;
  status: RelationStatus;
  summary: string;
  route: string | null;
  module: string;
}

export interface RelationDefinition<TSnapshot> {
  key: string;
  label: string;
  module: string;
  resolve: (snapshot: TSnapshot) => Omit<RelationEdge, "key" | "label" | "module">;
}

export type RelationMap<TSnapshot> = RelationDefinition<TSnapshot>[];

export type SuggestionCategory =
  "matricula" | "financeiro" | "documentos" | "academico" | "encarregado" | "geral";

export interface Suggestion {
  id: string;
  title: string;
  description?: string;
  route: string;
  category: SuggestionCategory;
  module: string;
  requiresWrite?: boolean;
  priority: number;
  reason: string;
}

export interface SuggestionRule<TSnapshot> {
  id: string;
  evaluate: (snapshot: TSnapshot, context: AppContext) => Suggestion | null;
}
