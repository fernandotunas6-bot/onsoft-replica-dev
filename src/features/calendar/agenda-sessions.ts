import type { SupabaseAuthContext } from "@/integrations/supabase/auth-middleware";
import type { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { schoolDateInDays, schoolTodayIso } from "@/lib/school-date";
import { loadAcademicAgendaForRequest } from "./agenda-server";

export async function syncAcademicAgendaToSessions({
  db,
  schoolId,
  classGroupId,
  academicYearId,
  userId,
  context,
}: {
  db: Awaited<ReturnType<typeof loadSgaAdminClient>>;
  schoolId: string;
  classGroupId: string;
  academicYearId: string;
  userId: string;
  context: Pick<SupabaseAuthContext, "supabase" | "userId">;
}): Promise<number> {
  const start = schoolTodayIso(),
    end = schoolDateInDays(28);
  const agenda = await loadAcademicAgendaForRequest(
    { start, end, classGroupId, academicYearId },
    context,
  );
  // Mesmas ocorrências da agenda: versão publicada, validade, períodos, feriados
  // e interrupções. A consulta GET nunca cria sessões; só a publicação o faz.
  const lessons = agenda.filter((event) => event.extendedProps.source === "lesson");
  if (!lessons.length) return 0;
  const slotId = (sourceId: string) => sourceId.split("@")[0];
  const slotIds = [...new Set(lessons.map((event) => slotId(event.extendedProps.sourceId)))];
  const { data: existing, error: readError } = await db
    .from("siga_attendance_sessions")
    .select("timetable_slot_id, lesson_date")
    .eq("school_id", schoolId)
    .in("timetable_slot_id", slotIds)
    .gte("lesson_date", start)
    .lt("lesson_date", end);
  if (readError)
    throw publicDatabaseError(readError, "Não foi possível verificar as sessões de presença.");
  const keys = new Set(
    (existing ?? []).map((row) => `${row.timetable_slot_id}@${row.lesson_date}`),
  );
  const candidates = lessons
    .filter((event) => !keys.has(event.extendedProps.sourceId))
    .map((event) => ({
      school_id: schoolId,
      academic_year_id: academicYearId,
      class_group_id: classGroupId,
      subject_id: event.extendedProps.subjectId!,
      teacher_id: event.extendedProps.teacherId ?? null,
      timetable_slot_id: slotId(event.extendedProps.sourceId),
      lesson_date: event.start.slice(0, 10),
      starts_at: event.start.slice(11, 16),
      ends_at: event.end!.slice(11, 16),
      status: "pending",
      created_by: userId,
    }));
  if (!candidates.length) return 0;
  const { error } = await db.from("siga_attendance_sessions").insert(candidates);
  if (error)
    throw publicDatabaseError(error, "Não foi possível sincronizar as sessões de presença.");
  return candidates.length;
}
