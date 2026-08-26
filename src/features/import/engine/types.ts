import type { SupabaseClient } from "@supabase/supabase-js";
import type { ImportModule } from "../schemas";

/** Contexto de execução de um commit — sempre ligado à escola e ao utilizador autenticado. */
export type ImportCommitContext = {
  db: SupabaseClient;
  sessionSupabase: SupabaseClient;
  schoolId: string;
  academicYearId: string | null;
  userId: string;
  duplicateStrategy: "update" | "ignore" | "create_new";
  dryRun: boolean;
};

export type AuditEntry = {
  table_name: string;
  target_id: string;
  action_type: "inserted" | "updated" | "deleted";
  before_data?: Record<string, unknown> | null;
  after_data?: Record<string, unknown> | null;
};

export type RowCommitResult = {
  status: "imported" | "will_update" | "will_insert" | "error" | "ignored";
  target_record_id?: string | null;
  warnings: string[];
  errors: string[];
  audits: AuditEntry[];
};

export type ImportRefCache = {
  existingPeople: Array<{
    id: string;
    full_name: string;
    email: string | null;
    phone: string | null;
    national_id: string | null;
    date_of_birth: string | null;
    status: string;
  }>;
  classGroups: Array<{ id: string; name: string }>;
  studentByPersonId: Map<string, { id: string; student_number: string }>;
};

/** Um importador processa UMA linha normalizada de staging de cada vez. */
export type RowImporter = {
  module: ImportModule;
  /** Carrega, UMA VEZ por lote, tudo o que analyzeRow/commitRow precisam para não repetir queries por linha. */
  loadRefCache(
    ctx: Pick<ImportCommitContext, "db" | "schoolId" | "academicYearId">,
  ): Promise<ImportRefCache>;
  /** Valida + calcula o estado provável da linha sem gravar nada (staging). */
  analyzeRow(
    normalized: Record<string, unknown>,
    cache: ImportRefCache,
  ): {
    status: "valid" | "warning" | "error" | "duplicate";
    warnings: string[];
    errors: string[];
    duplicate_of?: string | null;
  };
  /** Grava de facto (ou simula, se ctx.dryRun) uma linha já validada. */
  commitRow(
    normalized: Record<string, unknown>,
    ctx: ImportCommitContext,
    cache: ImportRefCache,
  ): Promise<RowCommitResult>;
};
