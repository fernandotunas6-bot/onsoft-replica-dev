import { z } from "zod";

export const importModuleOptions = [
  "pessoas",
  "alunos",
  "encarregados",
  "professores",
  "funcionarios",
  "turmas",
  "classes",
  "cursos",
  "disciplinas",
  "salas",
  "matriculas",
  "inscricoes",
  "horarios",
  "notas",
  "avaliacoes",
  "pautas",
  "presencas",
  "propinas",
  "pagamentos",
  "dividas",
  "historico_academico",
  "historico_financeiro",
] as const;

export type ImportModule = (typeof importModuleOptions)[number];

export const IMPLEMENTED_IMPORT_MODULES = [
  "matriculas",
  "alunos",
  "encarregados",
  "professores",
  "funcionarios",
  "turmas",
  "classes",
  "cursos",
  "disciplinas",
  "salas",
  "horarios",
  "notas",
  "pagamentos",
  "dividas",
  "pessoas",
] as const satisfies readonly ImportModule[];

export type ImplementedImportModule = (typeof IMPLEMENTED_IMPORT_MODULES)[number];

export const importJobStatusOptions = [
  "uploaded",
  "analyzing",
  "mapping",
  "validating",
  "ready",
  "importing",
  "completed",
  "failed",
  "cancelled",
  "rolled_back",
] as const;

export type ImportJobStatus = (typeof importJobStatusOptions)[number];

export const importRowStatusOptions = [
  "valid",
  "warning",
  "error",
  "duplicate",
  "will_update",
  "will_insert",
  "ignored",
  "imported",
] as const;

export type ImportRowStatus = (typeof importRowStatusOptions)[number];

export const createImportJobSchema = z.object({
  academic_year_id: z.string().uuid().optional().nullable(),
  module: z.enum(importModuleOptions),
  file_name: z.string().min(1),
  total_rows: z.number().int().nonnegative().default(0),
});

export type CreateImportJobInput = z.infer<typeof createImportJobSchema>;

export const analyzeImportFileInputSchema = z.object({
  file_base64: z.string().min(1),
  file_name: z.string().min(1),
});

export type AnalyzeImportFileInput = z.infer<typeof analyzeImportFileInputSchema>;

export const stageImportRowsInputSchema = z.object({
  job_id: z.string().uuid(),
  sheet_name: z.string().min(1),
  rows: z.array(z.record(z.string(), z.unknown())),
  column_mapping: z.record(z.string(), z.string()),
});

export type StageImportRowsInput = z.infer<typeof stageImportRowsInputSchema>;

/**
 * O cliente antigo chegou a pedir lotes de apenas 5 linhas. Isso multiplicava
 * chamadas HTTP em importações grandes. O servidor impõe um piso de 200 linhas
 * e continua a aceitar no máximo 500, mantendo compatibilidade com clientes já publicados.
 */
export const commitImportBatchSchema = z.object({
  job_id: z.string().uuid(),
  batch_size: z
    .number()
    .int()
    .positive()
    .max(500)
    .default(200)
    .transform((size) => Math.max(200, size)),
  dry_run: z.boolean().default(false),
  duplicate_strategy: z.enum(["update", "ignore", "create_new"]).default("update"),
  /** Só usado em dry_run: como o estado da linha não muda, pagina por row_number em vez de por status. */
  after_row_number: z.number().int().nonnegative().default(0),
});

export type CommitImportBatchInput = z.infer<typeof commitImportBatchSchema>;

export const saveColumnMappingSchema = z.object({
  job_id: z.string().uuid(),
  module: z.enum(importModuleOptions),
  mappings: z.record(z.string(), z.string()),
  save_template_name: z.string().optional(),
});

export type SaveColumnMappingInput = z.infer<typeof saveColumnMappingSchema>;

export const updateStagingRowSchema = z.object({
  row_id: z.string().uuid(),
  field_name: z.string(),
  new_value: z.any(),
});

export type UpdateStagingRowInput = z.infer<typeof updateStagingRowSchema>;

export const rollbackImportJobSchema = z.object({
  job_id: z.string().uuid(),
  reason: z.string().optional(),
});

export type RollbackImportJobInput = z.infer<typeof rollbackImportJobSchema>;

export interface ImportJobRecord {
  id: string;
  school_id: string;
  academic_year_id?: string | null;
  user_id?: string | null;
  module: ImportModule;
  file_name: string;
  file_path?: string | null;
  status: ImportJobStatus;
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  duplicate_rows: number;
  inserted_rows: number;
  updated_rows: number;
  ignored_rows: number;
  job_metadata?: Record<string, any> | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface ImportRowRecord {
  id: string;
  import_job_id: string;
  sheet_name: string;
  row_number: number;
  raw_data: Record<string, any>;
  normalized_data: Record<string, any>;
  status: ImportRowStatus;
  warnings: string[];
  errors: string[];
  duplicate_of?: string | null;
  target_record_id?: string | null;
  created_at: string;
}

export const downloadOfficialTemplateSchema = z.object({
  module: z.enum(importModuleOptions),
});
export type DownloadOfficialTemplateInput = z.infer<typeof downloadOfficialTemplateSchema>;

export const exportSchoolDataSchema = z.object({
  academic_year_id: z.string().uuid().optional().nullable(),
  class_group_id: z.string().uuid().optional().nullable(),
  modules: z.array(z.enum(importModuleOptions)).min(1),
  mode: z.enum(["human", "siga_exchange"]),
});
export type ExportSchoolDataInput = z.infer<typeof exportSchoolDataSchema>;

