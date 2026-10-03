import type { SupabaseClient } from "@supabase/supabase-js";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import * as legacy from "./sga-grades-legacy";

// O SGA remoto diverge dos tipos locais gerados.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>;

export { listSgaTermGrades } from "./sga-grades-legacy";

async function requireConfiguredTerm(
  db: Db,
  schoolId: string,
  academicYearId: string,
  term: number,
) {
  const { data, error } = await db
    .from("terms")
    .select("id, sequence, name, academic_year_id")
    .eq("school_id", schoolId)
    .eq("academic_year_id", academicYearId)
    .eq("sequence", term)
    .maybeSingle();

  if (error) {
    throw publicDatabaseError(error, "Não foi possível validar o período académico.");
  }
  if (!data?.id) {
    throw new Error(
      `O ${term}º trimestre/período ainda não está configurado para este ano lectivo. Configure o calendário académico antes de lançar notas.`,
    );
  }
  return data;
}

async function requireConfiguredClassSubject(
  db: Db,
  schoolId: string,
  classGroupId: string,
  subjectId: string,
) {
  const { data, error } = await db
    .from("class_subjects")
    .select("id, class_group_id, subject_id, teacher_id, status")
    .eq("school_id", schoolId)
    .eq("class_group_id", classGroupId)
    .eq("subject_id", subjectId)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    throw publicDatabaseError(
      error,
      "Não foi possível validar a disciplina e o professor da turma.",
    );
  }
  if (!data?.id) {
    throw new Error(
      "Esta disciplina ainda não está atribuída a esta turma. Faça a atribuição no módulo pedagógico antes de lançar notas.",
    );
  }
  if (!data.teacher_id) {
    throw new Error(
      "Esta disciplina está na turma, mas ainda não tem professor atribuído. Atribua o docente antes de lançar notas.",
    );
  }
  return data;
}

/** Estados em que a pauta é oficial: as notas já não se alteram directamente. */
export const LOCKED_SHEET_STATUSES = ["homologated", "published", "closed", "contested"];

const SHEET_STATUS_PT: Record<string, string> = {
  homologated: "homologada",
  published: "publicada",
  closed: "fechada",
  contested: "contestada",
};

/**
 * Recusa lançar/alterar notas de um período cuja pauta (do período ou anual)
 * já é oficial. A alteração passa a pedido, aprovado pela coordenação.
 */
export async function assertGradesNotLocked(
  db: Db,
  schoolId: string,
  classGroupId: string,
  termId: string,
) {
  const { data: sheets, error } = await db
    .from("grade_sheets")
    .select("kind, term_id, status")
    .eq("school_id", schoolId)
    .eq("class_group_id", classGroupId)
    .in("status", LOCKED_SHEET_STATUSES);
  if (error) {
    // Tabela ausente: sem pautas oficiais, nada a bloquear. Qualquer outro erro
    // recusa — não se sabe se a pauta já é oficial.
    const missing =
      error.code === "42P01" ||
      error.code === "PGRST205" ||
      /does not exist|schema cache/i.test(String(error.message ?? ""));
    if (missing) return;
    throw publicDatabaseError(error, "Não foi possível confirmar se a pauta já é oficial.");
  }
  const locked = (sheets ?? []).find(
    (sheet: { kind: string; term_id: string | null }) =>
      sheet.kind === "annual" || String(sheet.term_id) === termId,
  );
  if (locked) {
    throw new Error(
      `A pauta deste período está ${SHEET_STATUS_PT[String(locked.status)] ?? "fechada"}: as notas já não se alteram aqui. Peça a alteração na pauta (Pedagógica → Pautas), com o motivo.`,
    );
  }
}

/**
 * Para as avaliações (testes, trabalhos) que alimentam o MAC: o mesmo bloqueio
 * da pauta oficial, a partir da turma e do número do período.
 */
export async function assertAssessmentTermNotLocked(
  db: Db,
  schoolId: string,
  classGroupId: string,
  term: number,
) {
  const { data: group, error } = await db
    .from("class_groups")
    .select("academic_year_id")
    .eq("school_id", schoolId)
    .eq("id", classGroupId)
    .maybeSingle();
  if (error) throw publicDatabaseError(error, "Não foi possível validar a turma da avaliação.");
  if (!group?.academic_year_id) return;
  const { data: termRow, error: termError } = await db
    .from("terms")
    .select("id")
    .eq("school_id", schoolId)
    .eq("academic_year_id", String(group.academic_year_id))
    .eq("sequence", term)
    .maybeSingle();
  if (termError) throw publicDatabaseError(termError, "Não foi possível validar o período.");
  if (!termRow?.id) return;
  await assertGradesNotLocked(db, schoolId, classGroupId, String(termRow.id));
}

/**
 * Compatibilidade para fluxos antigos de horário. Nunca escolhe o primeiro
 * professor activo da escola: só aceita um docente explicitamente ligado ao
 * utilizador que iniciou a operação.
 */
export async function ensureDefaultTeacher(db: Db, schoolId: string, userId: string) {
  const { data, error } = await db
    .from("teachers")
    .select("id")
    .eq("school_id", schoolId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (error) throw publicDatabaseError(error, "Não foi possível validar o professor.");
  if (data?.id) return String(data.id);

  throw new Error(
    "A turma/disciplina precisa de um professor atribuído explicitamente. Faça a atribuição antes de criar o horário ou lançar notas.",
  );
}

export async function upsertSgaTermGrade(params: {
  db: Db;
  schoolId: string;
  userId: string;
  enrollmentId: string;
  subjectId: string;
  term: number;
  mac: number;
  npp: number;
  npt: number;
}) {
  const { db, schoolId, enrollmentId, subjectId, term } = params;
  const { data: enrollment, error } = await db
    .from("enrollments")
    .select("id, class_group_id, academic_year_id, status")
    .eq("id", enrollmentId)
    .eq("school_id", schoolId)
    .maybeSingle();

  if (error) throw publicDatabaseError(error, "Não foi possível validar a matrícula.");
  if (!enrollment?.id || !enrollment.class_group_id || !enrollment.academic_year_id) {
    throw new Error("A matrícula precisa de turma e ano lectivo para lançar notas.");
  }
  if (!["active", "pending"].includes(String(enrollment.status ?? ""))) {
    throw new Error("Só é possível lançar notas numa matrícula activa ou pendente válida.");
  }

  const termRow = await requireConfiguredTerm(
    db,
    schoolId,
    String(enrollment.academic_year_id),
    term,
  );
  await requireConfiguredClassSubject(db, schoolId, String(enrollment.class_group_id), subjectId);
  await assertGradesNotLocked(db, schoolId, String(enrollment.class_group_id), String(termRow.id));

  // A implementação histórica continua a tratar gradebook, itens MAC/NPP/NPT e
  // upsert dos scores. Como período e class_subject já existem, os antigos
  // caminhos de auto-criação perigosa deixam de ser alcançados.
  return legacy.upsertSgaTermGrade(params);
}

export async function upsertSgaTermGradesBatch(params: {
  db: Db;
  schoolId: string;
  userId: string;
  subjectId: string;
  term: number;
  rows: Array<{ enrollmentId: string; mac: number; npp: number; npt: number }>;
}) {
  const { db, schoolId, subjectId, term, rows } = params;
  if (!rows.length) return { saved: 0 };

  const enrollmentIds = [...new Set(rows.map((row) => row.enrollmentId))];
  const { data: enrollments, error } = await db
    .from("enrollments")
    .select("id, class_group_id, academic_year_id, status")
    .eq("school_id", schoolId)
    .in("id", enrollmentIds);

  if (error) throw publicDatabaseError(error, "Não foi possível validar as matrículas.");
  if ((enrollments ?? []).length !== enrollmentIds.length) {
    throw new Error("O lote contém uma ou mais matrículas inválidas para esta escola.");
  }

  const contexts = new Map<string, { classGroupId: string; academicYearId: string }>();
  for (const enrollment of enrollments ?? []) {
    if (!enrollment.class_group_id || !enrollment.academic_year_id) {
      throw new Error("Todas as matrículas precisam de turma e ano lectivo para lançar notas.");
    }
    if (!["active", "pending"].includes(String(enrollment.status ?? ""))) {
      throw new Error("O lote contém uma matrícula que já não permite lançamento de notas.");
    }
    const classGroupId = String(enrollment.class_group_id);
    const academicYearId = String(enrollment.academic_year_id);
    contexts.set(`${classGroupId}:${academicYearId}`, { classGroupId, academicYearId });
  }

  for (const context of contexts.values()) {
    const termRow = await requireConfiguredTerm(db, schoolId, context.academicYearId, term);
    await requireConfiguredClassSubject(db, schoolId, context.classGroupId, subjectId);
    await assertGradesNotLocked(db, schoolId, context.classGroupId, String(termRow.id));
  }

  return legacy.upsertSgaTermGradesBatch(params);
}
