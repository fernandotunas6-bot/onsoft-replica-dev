import type { SupabaseAuthContext } from "@/integrations/supabase/auth-middleware";
import { loadSgaAdminClient, requireSgaWriterForWrite } from "@/integrations/supabase/sga-admin";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { requireAal2 } from "@/features/hr/require-aal2";
import type { PublishAcademicScheduleInput } from "./schemas";
import { syncAcademicAgendaToSessions } from "@/features/calendar/agenda-sessions";
import { notifySchedulePublished } from "./timetable-lessons";

/** A retry of calendar synchronization never creates another schedule version. */
export async function resyncAcademicScheduleForRequest(
  data: Pick<PublishAcademicScheduleInput, "classGroupId" | "academicYearId">,
  context: SupabaseAuthContext,
) {
  requireAal2(context.claims, "Sincronizar o horário");
  const membership = await requireSgaWriterForWrite(
    "pedagogica",
    context.supabase,
    context.userId,
    ["Administrador", "Secretaria"],
  );
  const db = await loadSgaAdminClient();
  const { data: schedule, error } = await db
    .from("academic_schedules")
    .select("id")
    .eq("school_id", membership.schoolId)
    .eq("class_group_id", data.classGroupId)
    .eq("academic_year_id", data.academicYearId)
    .eq("status", "published")
    .is("deleted_at", null)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw publicDatabaseError(error, "Não foi possível validar o horário publicado.");
  if (!schedule) throw new Error("Não existe um horário publicado para esta turma e ano lectivo.");
  const generatedSessions = await syncAcademicAgendaToSessions({
    db,
    schoolId: membership.schoolId,
    classGroupId: data.classGroupId,
    academicYearId: data.academicYearId,
    userId: context.userId,
    context,
  });
  return { scheduleId: schedule.id, generatedSessions };
}

/** Core publication commits once; attendance and notifications follow the commit. */
export async function publishAcademicScheduleForRequest(
  data: PublishAcademicScheduleInput,
  context: SupabaseAuthContext,
) {
  requireAal2(context.claims, "Publicar o horário");
  const membership = await requireSgaWriterForWrite(
    "pedagogica",
    context.supabase,
    context.userId,
    ["Administrador", "Secretaria"],
  );
  const db = await loadSgaAdminClient();
  const args = {
    p_school_id: membership.schoolId,
    p_class_group_id: data.classGroupId,
    p_academic_year_id: data.academicYearId,
    p_actor: context.userId,
    ...(data.validFrom ? { p_valid_from: data.validFrom } : {}),
    ...(data.validTo ? { p_valid_to: data.validTo } : {}),
    ...(data.name ? { p_name: data.name } : {}),
  };
  let result = await db.rpc("publish_academic_schedule_atomic", args);
  // Only retry SQL errors that guarantee the previous transaction was rolled back.
  for (
    let attempt = 0;
    attempt < 2 && result.error && ["40P01", "40001"].includes(result.error.code);
    attempt++
  ) {
    result = await db.rpc("publish_academic_schedule_atomic", args);
  }
  if (result.error) throw publicDatabaseError(result.error, "Não foi possível publicar o horário.");
  const schedule = result.data;
  if (!schedule) throw new Error("Não foi possível publicar o horário.");
  let generatedSessions = 0;
  if (data.syncToCalendar) {
    try {
      generatedSessions = await syncAcademicAgendaToSessions({
        db,
        schoolId: membership.schoolId,
        classGroupId: data.classGroupId,
        academicYearId: data.academicYearId,
        userId: context.userId,
        context,
      });
    } catch {
      throw new Error(
        "O horário foi publicado, mas não foi possível preparar as sessões de presença. Actualize a agenda e volte a sincronizar as sessões.",
      );
    }
  }
  const notified = await notifySchedulePublished(db, {
    schoolId: membership.schoolId,
    classGroupId: data.classGroupId,
    validFrom: schedule.valid_from,
    scheduleId: schedule.id,
  }).catch(() => 0);
  return { schedule, generatedSessions, notified, success: true };
}
