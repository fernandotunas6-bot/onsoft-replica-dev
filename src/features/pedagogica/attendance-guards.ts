/**
 * Guardas da chamada de presenças partilhadas pelo portal
 * (`attendance-server.ts`) e pela chamada do Mobile V4
 * (`mobile-v4/attendance-call.server.ts`): uma só regra para a pauta oficial e
 * para a taxa de presença.
 *
 * Fica num módulo próprio, sem `createServerFn`, porque o Worker do Mobile
 * empacota o código do servidor com esbuild e não leva o runtime do portal.
 */
import type { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { LOCKED_SHEET_STATUSES } from "@/features/academic/sga-grades";

type AdminDb = Awaited<ReturnType<typeof loadSgaAdminClient>>;

/**
 * Presente, dispensado (justificado) e atrasado contam a favor da assiduidade; só a ausência
 * sem justificação penaliza a taxa. "not_registered" já é excluído antes de chegar aqui.
 */
export function computeAttendanceRate(records: Array<{ status: string }>): number | null {
  if (records.length === 0) return null;
  const presentCount = records.filter(
    (r) => r.status === "present" || r.status === "excused" || r.status === "late",
  ).length;
  return Math.round((presentCount / records.length) * 100);
}

/**
 * Recalcula a taxa de presença de vários alunos numa só instrução
 * (`siga_recompute_attendance_rates`, migração 20260928230000). Antes eram duas
 * idas à base por aluno, e a leitura sujeita ao limite de 1000 linhas do
 * PostgREST. Se a função ainda não existir, faz o cálculo antigo aluno a aluno.
 * A taxa é derivada: uma falha aqui não desfaz a chamada já gravada.
 */
export async function recomputeAttendanceRates(
  db: AdminDb,
  schoolId: string,
  studentIds: string[],
) {
  const ids = [...new Set(studentIds)];
  if (ids.length === 0) return;
  const { error } = await db.rpc("siga_recompute_attendance_rates", {
    p_school_id: schoolId,
    p_student_ids: ids,
  });
  if (!error) return;
  if (error.code !== "PGRST202" && error.code !== "42883") {
    console.warn("[attendance] recálculo da taxa falhou:", error.message);
    return;
  }
  for (const studentId of ids) {
    await recomputeStudentAttendanceRateLegacy(db, schoolId, studentId);
  }
}

async function recomputeStudentAttendanceRateLegacy(
  db: AdminDb,
  schoolId: string,
  studentId: string,
) {
  try {
    const { data: records } = await db
      .from("siga_attendance_records")
      .select("status")
      .eq("school_id", schoolId)
      .eq("student_id", studentId)
      .neq("status", "not_registered");

    if (!records || records.length === 0) return;

    const rate = computeAttendanceRate(records as Array<{ status: string }>);
    if (rate === null) return;

    await db
      .from("enrollments")
      .update({ attendance_rate: rate, updated_at: new Date().toISOString() })
      .eq("school_id", schoolId)
      .eq("student_id", studentId)
      .eq("status", "active");
  } catch {
    /* ignore fallback calculation error */
  }
}

/**
 * As faltas entram na pauta (o detalhe da pauta lê-as da chamada, ao vivo). Uma
 * chamada, uma correcção ou uma justificação num período cuja pauta (do período
 * ou anual) já é oficial mudava a percentagem de faltas de uma pauta homologada
 * ou publicada (auditoria 13). A regra é a das notas (`LOCKED_SHEET_STATUSES`).
 */
export async function assertAttendanceNotLocked(
  db: AdminDb,
  schoolId: string,
  session: { class_group_id: unknown; lesson_date?: unknown },
): Promise<void> {
  const classGroupId = session.class_group_id ? String(session.class_group_id) : "";
  const lessonDate = session.lesson_date ? String(session.lesson_date).slice(0, 10) : "";
  if (!classGroupId || !lessonDate) return;
  const { data: group } = await db
    .from("class_groups")
    .select("academic_year_id")
    .eq("school_id", schoolId)
    .eq("id", classGroupId)
    .maybeSingle();
  if (!group?.academic_year_id) return;
  const { data: term } = await db
    .from("terms")
    .select("id")
    .eq("school_id", schoolId)
    .eq("academic_year_id", String(group.academic_year_id))
    .lte("starts_on", lessonDate)
    .gte("ends_on", lessonDate)
    .limit(1)
    .maybeSingle();
  const { data: sheets, error } = await db
    .from("grade_sheets")
    .select("kind, term_id")
    .eq("school_id", schoolId)
    .eq("class_group_id", classGroupId)
    .in("status", LOCKED_SHEET_STATUSES);
  if (error) {
    throw publicDatabaseError(error, "Não foi possível confirmar se a pauta já é oficial.");
  }
  const locked = (sheets ?? []).some(
    (sheet: { kind: string; term_id: string | null }) =>
      sheet.kind === "annual" || (term?.id && String(sheet.term_id) === String(term.id)),
  );
  if (locked) {
    throw new Error(
      "A pauta deste período já é oficial: as presenças desta aula já não se alteram. Peça a alteração na pauta (Pedagógica → Pautas), com o motivo.",
    );
  }
}
