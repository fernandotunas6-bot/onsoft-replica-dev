import type { ModuleGrantMap } from "@/features/auth/access-policy";

export type EntityType =
  | "student"
  | "teacher"
  | "class"
  | "finance-overview"
  | "dashboard-overview"
  /** Uma disciplina dentro de uma turma: o id é `<turma>:<disciplina>`. */
  | "subject-offering"
  /** Uma fatura da escola activa (contexto financeiro). */
  | "invoice"
  /** Um vínculo laboral (funcionário) da escola activa (contexto RH). */
  | "employee"
  /** Um ficheiro dos Arquivos da escola activa (contexto Documentos e Arquivos). */
  | "file"
  /** Um comunicado da escola activa (contexto Comunicações). */
  | "announcement";

export interface EntityFocus<T = unknown> {
  type: EntityType;
  id: string;
  label: string;
  schoolId: string;
  data: T;
  /** Entidades ligadas que a página leu do servidor com esta (a turma do aluno). */
  relations?: ContextFrame["relations"];
}

export interface AppContext {
  userId: string;
  role: string;
  grants: ModuleGrantMap;
  pathname: string;
  focusedEntity: EntityFocus | null;
}

/** Um passo do caminho do contexto (Turma A → Matemática). */
export interface ContextFrame {
  type: EntityType;
  id: string;
  /** Vem sempre de uma leitura validada no servidor, nunca da URL. */
  label: string;
  /**
   * Entidades ligadas que o servidor devolveu com esta (o professor de uma
   * disciplina na turma). Só ids lidos do servidor, como o rótulo.
   */
  relations?: Readonly<Partial<Record<EntityType, string>>>;
}

/**
 * O contexto activo resolvido uma vez e lido por sidebar, breadcrumb, conteúdo
 * e painel de relações. Estende o AppContext: utilizador, papel e permissões
 * continuam a vir de lá.
 */
export interface ResolvedContext extends AppContext {
  schoolId: string;
  academicYearId: string | null;
  /** Do mais geral para o mais específico. Vazio = só a área. */
  trail: ContextFrame[];
  /** Id da entrada do registo seleccionada; null quando nenhuma corresponde. */
  activeView: string | null;
  /** Escola, papel, ano e ids do caminho: prefixo das chaves de cache do contexto. */
  key: string;
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
