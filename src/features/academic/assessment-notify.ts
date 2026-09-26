/**
 * Avisos das avaliações: prova marcada (alunos da turma e, se foi a direcção a
 * marcar, o professor) e prazo de lançamento a aproximar-se (professores com
 * componentes da pauta por lançar). Nunca falham a operação que os origina.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { todayInLuanda } from "@/features/calendar/dates";
import { formatDateLabel } from "./lesson-messages";
import { insertInAppNotifications, resolveClassAudience } from "./lesson-delivery";
import { buildTeacherAssessmentBoard } from "./teacher-assessments";
import { deadlineLabel, shouldRemindDeadline } from "./teacher-assessment-board";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>;

export async function notifyAssessmentScheduled(
  db: Db,
  input: {
    schoolId: string;
    classGroupId: string;
    subjectId: string;
    itemId: string;
    name: string;
    assessedOn: string | null | undefined;
    creatorUserId: string;
  },
) {
  try {
    if (!input.assessedOn || input.assessedOn < todayInLuanda()) return 0;
    const [{ data: subject }, { data: cs }] = await Promise.all([
      db.from("subjects").select("name").eq("id", input.subjectId).maybeSingle(),
      db
        .from("class_subjects")
        .select("teacher_id")
        .eq("school_id", input.schoolId)
        .eq("class_group_id", input.classGroupId)
        .eq("subject_id", input.subjectId)
        .maybeSingle(),
    ]);
    const subjectName = subject?.name ? String(subject.name) : "Disciplina";
    const when = formatDateLabel(input.assessedOn);
    const students = await resolveClassAudience(db, input.schoolId, [input.classGroupId], {
      teachers: false,
      students: true,
      guardians: false,
    });
    const rows = students
      .filter((r) => r.userId)
      .map((r) => ({
        userId: r.userId!,
        eventType: "academic.assessment.scheduled",
        title: `Avaliação marcada: ${subjectName}`,
        body: `${input.name} — ${when}.`,
        payload: { itemId: input.itemId },
      }));
    if (cs?.teacher_id) {
      const { data: teacher } = await db
        .from("teachers")
        .select("user_id")
        .eq("id", cs.teacher_id)
        .maybeSingle();
      if (teacher?.user_id && String(teacher.user_id) !== input.creatorUserId) {
        rows.push({
          userId: String(teacher.user_id),
          eventType: "academic.assessment.scheduled",
          title: `A direcção marcou uma avaliação de ${subjectName}`,
          body: `${input.name} — ${when}. Prepare a prova e lance as notas depois.`,
          payload: { itemId: input.itemId },
        });
      }
    }
    return await insertInAppNotifications(db, input.schoolId, rows);
  } catch (error) {
    console.warn("[assessment.scheduled] avisos não enviados:", error);
    return 0;
  }
}

/** Uma vez por dia (7, 3 e 1 dia antes do fim do período), a quem tem notas por lançar. */
export async function remindGradeDeadlines(db: Db, schoolId: string, today = todayInLuanda()) {
  const { data: teachers } = await db
    .from("teachers")
    .select("id, user_id")
    .eq("school_id", schoolId)
    .eq("status", "active")
    .not("user_id", "is", null);
  let sent = 0;
  for (const teacher of teachers ?? []) {
    const board = await buildTeacherAssessmentBoard(db, schoolId, String(teacher.id), today);
    if (!board.term) continue;
    const pending = board.rows.filter((r) => r.pendingComponents > 0);
    const pendingCount = pending.reduce((sum, r) => sum + r.pendingComponents, 0);
    if (!shouldRemindDeadline(board.term.daysLeft, pendingCount)) continue;
    const { count } = await db
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", teacher.user_id)
      .eq("event_type", "academic.grades.deadline")
      .gte("created_at", `${today}T00:00:00+01:00`);
    if (count) continue;
    const list = pending
      .slice(0, 6)
      .map((r) => `• ${r.className} · ${r.subjectName}: ${r.pendingComponents} por lançar`)
      .join("\n");
    sent += await insertInAppNotifications(db, schoolId, [
      {
        userId: String(teacher.user_id),
        eventType: "academic.grades.deadline",
        title: `${deadlineLabel(board.term.daysLeft)} (${board.term.name})`,
        body: `Componentes da pauta por lançar:\n${list}`,
        payload: { term: board.term.sequence },
      },
    ]).catch(() => 0);
  }
  return sent;
}
