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
  // e interrupções. Só a publicação/ressincronização autorizada escreve aqui.
  const lessons = agenda.filter((event) => event.extendedProps.source === "lesson");
  if (!lessons.length) return 0;
  const candidates = lessons.map((event) => ({
    school_id: schoolId,
    academic_year_id: academicYearId,
    class_group_id: classGroupId,
    subject_id: event.extendedProps.subjectId!,
    teacher_id: event.extendedProps.teacherId ?? null,
    timetable_slot_id: event.extendedProps.sourceId.split("@")[0],
    lesson_date: event.start.slice(0, 10),
    starts_at: event.start.slice(11, 16),
    ends_at: event.end!.slice(11, 16),
    status: "pending",
    created_by: userId,
  }));
  let inserted = 0;
  // ON CONFLICT DO NOTHING usa o índice único já existente em produção.
  // Dois pedidos simultâneos não duplicam sessões nem substituem uma chamada.
  // Lotes limitam o corpo HTTP; count evita truncar a contagem pela paginação.
  for (let offset = 0; offset < candidates.length; offset += 500) {
    const { error, count } = await db
      .from("siga_attendance_sessions")
      .upsert(candidates.slice(offset, offset + 500), {
        onConflict: "school_id,timetable_slot_id,lesson_date",
        ignoreDuplicates: true,
        count: "exact",
      });
    if (error)
      throw publicDatabaseError(error, "Não foi possível sincronizar as sessões de presença.");
    if (count === null)
      throw new Error(
        "Não foi possível confirmar a contagem das sessões sincronizadas. Volte a sincronizar.",
      );
    inserted += count;
  }
  return inserted;
}
