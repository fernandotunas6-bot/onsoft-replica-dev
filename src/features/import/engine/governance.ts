import type { SupabaseClient } from "@supabase/supabase-js";
import type { ImportModule } from "../schemas";

export const IMPORTER_TARGET_TABLES: Record<ImportModule, readonly string[]> = {
  pessoas: ["people"],
  alunos: ["people", "students", "student_guardians", "enrollments", "class_groups"],
  encarregados: ["people", "student_guardians"],
  professores: ["people", "teachers"],
  funcionarios: ["people", "hr_positions", "hr_employments"],
  turmas: ["grade_levels", "campuses", "class_groups"],
  classes: ["grade_levels", "programs"],
  cursos: ["programs"],
  disciplinas: ["subjects"],
  salas: ["rooms"],
  matriculas: ["enrollments"],
  inscricoes: ["people", "enrollment_applications"],
  horarios: ["class_groups", "subjects", "teachers", "class_subjects", "timetable_slots"],
  notas: ["enrollments", "terms", "class_subjects", "gradebooks", "grade_items", "grade_scores"],
  avaliacoes: ["class_groups", "subjects", "class_subjects", "terms", "gradebooks", "grade_items"],
  pautas: ["enrollments"],
  presencas: ["siga_attendance_sessions", "siga_attendance_records"],
  propinas: ["school_billing_settings"],
  pagamentos: ["finance_invoices", "finance_receipts"],
  dividas: ["finance_contracts", "finance_invoices"],
  historico_academico: ["student_academic_history"],
  historico_financeiro: ["finance_contracts", "finance_invoices"],
};

export async function assertImportModuleGoverned(
  db: SupabaseClient,
  module: ImportModule,
): Promise<void> {
  const targets = IMPORTER_TARGET_TABLES[module];
  if (!targets?.length) {
    throw new Error(`O módulo "${module}" não possui contrato de tabelas governado.`);
  }

  const { data, error } = await db
    .from("import_table_specs")
    .select("table_schema, table_name, direct_import_policy, sensitivity, active")
    .eq("table_schema", "public")
    .in("table_name", targets);

  if (error) {
    throw new Error(
      `Não foi possível validar a governança do módulo "${module}": ${error.message}`,
    );
  }

  const byName = new Map((data ?? []).map((row) => [String(row.table_name), row]));
  const missing = targets.filter((table) => !byName.has(table));
  const blocked = targets.filter((table) => {
    const row = byName.get(table);
    return (
      !row ||
      row.active !== true ||
      row.direct_import_policy !== "controlled" ||
      row.sensitivity === "secret" ||
      row.sensitivity === "internal"
    );
  });

  if (missing.length || blocked.length) {
    const details = [
      missing.length ? `ausentes: ${missing.join(", ")}` : "",
      blocked.length ? `não controladas: ${blocked.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("; ");
    throw new Error(
      `Importação do módulo "${module}" bloqueada pela governança do SGA: ${details}.`,
    );
  }
}
