/**
 * Aviso de trabalho devolvido: ao aluno e aos seus encarregados, na aplicação.
 * Como os avisos das avaliações, nunca falha a devolução que o origina.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { insertInAppNotifications } from "./lesson-delivery";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>;
type Row = Record<string, unknown>;
const str = (value: unknown) => (value == null ? "" : String(value));

/** O texto do aviso: a nota (se houver) e o início do comentário. */
export function taskReturnedMessage(input: {
  taskTitle: string;
  grade: number | null;
  feedback: string | null;
  toPauta: boolean;
}): string {
  const parts = [
    input.grade != null
      ? `${input.taskTitle}: ${String(input.grade).replace(".", ",")} valores${input.toPauta ? ", já na pauta" : ""}.`
      : `${input.taskTitle}: o professor devolveu o trabalho.`,
  ];
  const comment = input.feedback?.trim();
  if (comment) parts.push(`«${comment.length > 140 ? `${comment.slice(0, 137)}…` : comment}»`);
  return parts.join(" ");
}

export async function notifyTaskReturned(
  db: Db,
  input: {
    schoolId: string;
    taskId: string;
    taskTitle: string;
    subjectId: string;
    enrollmentId: string;
    grade: number | null;
    feedback: string | null;
    toPauta: boolean;
  },
): Promise<number> {
  try {
    const { data: enrollment } = await db
      .from("enrollments")
      .select("student_id")
      .eq("school_id", input.schoolId)
      .eq("id", input.enrollmentId)
      .maybeSingle();
    const studentId = str(enrollment?.student_id);
    if (!studentId) return 0;
    const [{ data: student }, { data: links }, { data: subject }] = await Promise.all([
      db
        .from("students")
        .select("person_id")
        .eq("school_id", input.schoolId)
        .eq("id", studentId)
        .maybeSingle(),
      db
        .from("student_guardians")
        .select("guardian_person_id")
        .eq("school_id", input.schoolId)
        .eq("student_id", studentId),
      db.from("subjects").select("name").eq("id", input.subjectId).maybeSingle(),
    ]);
    const guardianIds = ((links ?? []) as Row[]).map((row) => str(row.guardian_person_id));
    const personIds = [str(student?.person_id), ...guardianIds].filter(Boolean);
    if (!personIds.length) return 0;
    const [{ data: people }, { data: allLinks }] = await Promise.all([
      db
        .from("people")
        .select("id, user_id, full_name")
        .eq("school_id", input.schoolId)
        .in("id", personIds),
      // Encarregado com mais de um educando: a página da disciplina abriria o
      // primeiro, que pode não ser este; o aviso leva às Notas.
      guardianIds.length
        ? db
            .from("student_guardians")
            .select("guardian_person_id")
            .eq("school_id", input.schoolId)
            .in("guardian_person_id", guardianIds)
        : Promise.resolve({ data: [] as Row[] }),
    ]);
    const personById = new Map(((people ?? []) as Row[]).map((row) => [str(row.id), row]));
    const childCount = new Map<string, number>();
    for (const row of (allLinks ?? []) as Row[]) {
      const id = str(row.guardian_person_id);
      childCount.set(id, (childCount.get(id) ?? 0) + 1);
    }

    const subjectName = str(subject?.name) || "Disciplina";
    const subjectHref = `/pedagogica/disciplinas/${input.subjectId}`;
    const body = taskReturnedMessage(input);
    const studentPerson = personById.get(str(student?.person_id));
    const studentName = str(studentPerson?.full_name).split(/\s+/)[0] || "o seu educando";
    const rows = [];
    if (studentPerson?.user_id) {
      rows.push({
        userId: str(studentPerson.user_id),
        eventType: "academic.task.returned",
        title: `Trabalho devolvido: ${subjectName}`,
        body,
        payload: { taskId: input.taskId, href: subjectHref },
      });
    }
    for (const guardianId of new Set(guardianIds)) {
      const guardian = personById.get(guardianId);
      if (!guardian?.user_id) continue;
      rows.push({
        userId: str(guardian.user_id),
        eventType: "academic.task.returned",
        title: `${subjectName}: trabalho de ${studentName} devolvido`,
        body,
        payload: {
          taskId: input.taskId,
          href: (childCount.get(guardianId) ?? 1) > 1 ? "/pedagogica" : subjectHref,
        },
      });
    }
    return await insertInAppNotifications(db, input.schoolId, rows);
  } catch (error) {
    console.warn("[task.returned] avisos não enviados:", error);
    return 0;
  }
}
