/**
 * Leitura do registo de auditoria para o Administrador: o que aconteceu, a quê,
 * e porquê. Funções puras, partilhadas entre o servidor e o ecrã.
 */

export const AUDIT_SCOPES = ["all", "academic"] as const;
export type AuditScope = (typeof AUDIT_SCOPES)[number];

/** Tabelas e entidades do percurso académico (notas, pautas, matrículas…). */
export const ACADEMIC_ENTITY_TYPES = [
  "academic_years",
  "terms",
  "class_groups",
  "class_subjects",
  "enrollments",
  "gradebooks",
  "grade_items",
  "grade_scores",
  "grade_sheets",
  "assessment_rule_sets",
  "grading_scales",
  "siga_assessment_items",
  "siga_assessment_scores",
  "siga_exam_sessions",
  "siga_exam_registrations",
  "report_cards",
  "student_academic_history",
] as const;

/**
 * Escritas automáticas de instalação e configuração: milhares de linhas que
 * escondem o resto. Ficam fora da vista "Tudo".
 */
export const NOISY_ENTITY_TYPES = [
  "role_permissions",
  "document_sequences",
  "installation_runs",
  "installation_health_reports",
] as const;

const ENTITY_LABELS: Record<string, string> = {
  schools: "escola",
  people: "pessoa",
  students: "aluno",
  teachers: "professor",
  enrollments: "matrícula",
  school_memberships: "conta de acesso",
  school_access_request: "pedido de acesso",
  roles: "papel",
  member_roles: "função",
  student_guardians: "encarregado",
  finance_invoices: "fatura",
  finance_receipts: "recibo",
  announcements: "comunicado",
  academic_years: "ano lectivo",
  terms: "período lectivo",
  class_groups: "turma",
  class_subjects: "disciplina da turma",
  subjects: "disciplina",
  gradebooks: "diário de notas",
  grade_items: "componente de avaliação",
  grade_scores: "nota",
  grade_sheets: "pauta",
  grade_change_requests: "pedido de alteração de nota",
  assessment_rule_sets: "modelo de avaliação",
  grading_scales: "escala de notas",
  siga_assessment_items: "prova",
  siga_assessment_scores: "nota de prova",
  siga_exam_sessions: "sessão de exame",
  siga_exam_registrations: "inscrição em exame",
  report_cards: "boletim",
  student_academic_history: "histórico académico",
  document_requests: "documento",
  school_settings: "definições",
  timetable_slots: "horário",
};

const OPERATION_LABELS: Record<string, string> = {
  insert: "Criou",
  created: "Criou",
  update: "Alterou",
  delete: "Eliminou",
  deleted: "Eliminou",
  submitted: "Submeteu",
  approve: "Aprovou",
  reject: "Recusou",
  request_info: "Pediu informação sobre",
  start_review: "Abriu para análise",
  cancelled: "Cancelou",
  replied: "Respondeu a",
};

export function entityLabel(entityType: string): string {
  return ENTITY_LABELS[entityType] ?? entityType.replace(/_/g, " ");
}

/** "Alterou nota", "Aprovou pedido de acesso"… */
export function describeAuditAction(action: string, entityType: string): string {
  const operation = action.split(".").at(-1)?.toLowerCase() ?? "";
  const verb = OPERATION_LABELS[operation];
  if (verb) return `${verb} ${entityLabel(entityType)}`;
  return `${entityLabel(entityType)}: ${action.replace(/[._]/g, " ")}`;
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** O porquê, quando quem agiu o deu (motivo, nota da decisão…). */
export function auditReason(metadata: unknown): string | null {
  const m = asRecord(metadata);
  for (const key of ["reason", "motivo", "note", "decision_note", "justification"]) {
    const value = m[key];
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 300);
  }
  return null;
}

/** Campos alterados, quando o registo automático os guardou. */
export function auditChangedFields(metadata: unknown): string[] {
  const fields = asRecord(metadata)["changed_fields"];
  if (!Array.isArray(fields)) return [];
  return fields.filter((f): f is string => typeof f === "string" && f !== "updated_at").slice(0, 8);
}
