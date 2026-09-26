/**
 * Agenda do próprio aluno para o painel inicial: turma, média, próxima aula e
 * próxima avaliação. Antes o painel mostrava valores fixos ("Matemática",
 * "Física · Prova", média 14.7) a todos os alunos.
 *
 * Só o papel Aluno recebe dados, e só os da sua matrícula activa.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadSgaAdminClient, resolveSgaMembershipAdmin } from "@/integrations/supabase/sga-admin";
import { loadStudentScope } from "@/features/students/student-scope";
import { todayInLuanda } from "@/features/calendar/dates";
import { weekdayJsFromIso } from "@/features/dashboard/school-today";

export type StudentAgendaSlot = {
  weekday: number;
  startsAt: string;
  endsAt: string;
  subjectName: string;
};

export type StudentAgenda = {
  className: string | null;
  average: number | null;
  nextLesson: (StudentAgendaSlot & { daysAhead: number }) | null;
  nextAssessment: { name: string; subjectName: string; date: string; kind: string | null } | null;
};

const EMPTY: StudentAgenda = {
  className: null,
  average: null,
  nextLesson: null,
  nextAssessment: null,
};

/**
 * Próxima aula a partir de agora: primeiro as que ainda não terminaram hoje,
 * depois os dias seguintes da semana (weekday como Date.getDay, 0 = domingo).
 */
export function pickNextLesson(
  slots: StudentAgendaSlot[],
  todayWeekday: number,
  nowHhMm: string,
): (StudentAgendaSlot & { daysAhead: number }) | null {
  const now = nowHhMm.slice(0, 5);
  for (let daysAhead = 0; daysAhead < 7; daysAhead += 1) {
    const weekday = (todayWeekday + daysAhead) % 7;
    const candidates = slots
      .filter((slot) => slot.weekday === weekday)
      .filter((slot) => daysAhead > 0 || slot.endsAt.slice(0, 5) > now)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    if (candidates[0]) return { ...candidates[0], daysAhead };
  }
  return null;
}

function nowInLuandaHhMm(now = new Date()) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Luanda",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
}

export const getMyStudentAgenda = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StudentAgenda> => {
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership || membership.appRole !== "Aluno") return EMPTY;
    const db = await loadSgaAdminClient();
    const scope = await loadStudentScope(db, membership, context.userId);
    const studentId = scope.all ? null : scope.studentIds[0];
    if (!studentId) return EMPTY;
    const schoolId = membership.schoolId;

    const { data: enrollment } = await db
      .from("enrollments")
      .select("class_group_id, final_average")
      .eq("school_id", schoolId)
      .eq("student_id", studentId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const classGroupId = enrollment?.class_group_id ? String(enrollment.class_group_id) : null;
    const average =
      enrollment?.final_average != null && Number.isFinite(Number(enrollment.final_average))
        ? Number(enrollment.final_average)
        : null;
    if (!classGroupId) return { ...EMPTY, average };

    const today = todayInLuanda();
    const [groupRes, classSubjectsRes, assessmentRes] = await Promise.all([
      db
        .from("class_groups")
        .select("name")
        .eq("school_id", schoolId)
        .eq("id", classGroupId)
        .maybeSingle(),
      db
        .from("class_subjects")
        .select("id, subject_id")
        .eq("school_id", schoolId)
        .eq("class_group_id", classGroupId),
      db
        .from("siga_assessment_items")
        .select("name, kind, subject_id, assessed_on")
        .eq("school_id", schoolId)
        .eq("class_group_id", classGroupId)
        .gte("assessed_on", today)
        .order("assessed_on", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);

    const classSubjects = (classSubjectsRes.data ?? []) as Array<{
      id: string;
      subject_id: string | null;
    }>;
    const assessment = assessmentRes.error ? null : assessmentRes.data;
    const subjectIds = [
      ...new Set(
        [...classSubjects.map((row) => row.subject_id), assessment?.subject_id]
          .filter(Boolean)
          .map(String),
      ),
    ];
    const classSubjectIds = classSubjects.map((row) => String(row.id));

    const [subjectsRes, slotsRes] = await Promise.all([
      subjectIds.length
        ? db.from("subjects").select("id, name").eq("school_id", schoolId).in("id", subjectIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
      classSubjectIds.length
        ? db
            .from("timetable_slots")
            .select("class_subject_id, weekday, starts_at, ends_at")
            .eq("school_id", schoolId)
            .eq("status", "active")
            .in("class_subject_id", classSubjectIds)
        : Promise.resolve({
            data: [] as Array<{
              class_subject_id: string;
              weekday: number;
              starts_at: string;
              ends_at: string;
            }>,
          }),
    ]);

    const subjectName = new Map(
      (subjectsRes.data ?? []).map((row) => [String(row.id), String(row.name)]),
    );
    const subjectOfClassSubject = new Map(
      classSubjects.map((row) => [String(row.id), String(row.subject_id ?? "")]),
    );
    const slots: StudentAgendaSlot[] = (slotsRes.data ?? []).map((slot) => ({
      weekday: Number(slot.weekday),
      startsAt: String(slot.starts_at ?? ""),
      endsAt: String(slot.ends_at ?? ""),
      subjectName:
        subjectName.get(subjectOfClassSubject.get(String(slot.class_subject_id)) ?? "") ??
        "Disciplina",
    }));

    return {
      className: groupRes.data?.name ? String(groupRes.data.name) : null,
      average,
      nextLesson: pickNextLesson(slots, weekdayJsFromIso(today), nowInLuandaHhMm()),
      nextAssessment: assessment
        ? {
            name: String(assessment.name ?? "Avaliação"),
            kind: assessment.kind ? String(assessment.kind) : null,
            subjectName: subjectName.get(String(assessment.subject_id ?? "")) ?? "Disciplina",
            date: String(assessment.assessed_on),
          }
        : null,
    };
  });
