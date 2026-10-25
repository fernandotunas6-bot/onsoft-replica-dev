import type { SupabaseAuthContext } from "@/integrations/supabase/auth-middleware";
import { resolveSgaMembershipAdmin } from "@/integrations/supabase/sga-admin";
import { loadAcademicAgendaForRequest } from "./agenda-server";
import { addDaysIso, todayInLuanda } from "./dates";
import { sortDayAgendaLessons, type DayAgendaLesson } from "./day-lessons";
import { listDayAgendaLessonsInputSchema } from "./schemas";

/** The existing daily API uses the same published occurrences as FullCalendar. */
export async function loadDayAgendaLessons(
  input: { date?: string; limit?: number },
  context: Pick<SupabaseAuthContext, "supabase" | "userId">,
): Promise<DayAgendaLesson[]> {
  const data = listDayAgendaLessonsInputSchema.parse(input);
  const membership = await resolveSgaMembershipAdmin(context.userId);
  const roles = membership?.allAppRoles ?? (membership ? [membership.appRole] : []);
  if (!roles.some((r) => ["Administrador", "Secretaria", "Tesouraria", "Professor"].includes(r)))
    return [];
  const date = data.date ?? todayInLuanda();
  const events = await loadAcademicAgendaForRequest(
    { start: date, end: addDaysIso(date, 1) },
    context,
  );
  const lessons = events
    .filter((e) => e.extendedProps.source === "lesson")
    .map((event) => {
      const p = event.extendedProps;
      return {
        id: p.sourceId.split("@")[0],
        startsAt: event.start.slice(11, 16),
        endsAt: event.end!.slice(11, 16),
        room: p.room ?? null,
        classGroupId: p.classGroupId ?? null,
        classGroupName: p.classGroupName ?? "Turma",
        subjectId: p.subjectId ?? null,
        subjectName: p.subjectName ?? "Disciplina",
        teacherId: p.teacherId ?? null,
        teacherName: p.teacherName ?? null,
      };
    });
  // Limit only after authorization and calendar expansion, never before teacher scope.
  return sortDayAgendaLessons(lessons).slice(0, data.limit);
}
