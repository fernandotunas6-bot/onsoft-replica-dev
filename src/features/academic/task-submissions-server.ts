/**
 * Entregas de trabalhos. A tabela é só do servidor (migração 20261025140000): sem
 * políticas e sem privilégios para authenticated. Aqui decide-se quem pode o quê:
 *
 * - Professor da disciplina naquela turma, Administrador ou Secretaria: vê as
 *   entregas da turma, regista a entrega em papel e devolve com nota e comentário.
 * - Aluno: entrega na sua matrícula activa da turma da tarefa.
 * - Encarregado: vê a entrega do educando, não entrega por ele.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { loadSgaAdminClient, resolveSgaMembershipAdmin } from "@/integrations/supabase/sga-admin";
import { resolveVisibleStudent } from "@/features/dashboard/student-access";
import { ownTeacherId } from "./own-teacher";
import {
  decideSubmission,
  latestByEnrollment,
  studentView,
  type SubmissionRow,
} from "./task-submissions";

type Db = Awaited<ReturnType<typeof loadSgaAdminClient>>;
type Row = Record<string, unknown>;
const str = (value: unknown) => (value == null ? "" : String(value));

const MANAGER_ROLES = ["Administrador", "Secretaria"];
const SUBMISSION_COLUMNS =
  "id, enrollment_id, attempt, status, submitted_at, is_late, on_paper, body, grade, feedback, returned_at";

const taskInput = z.object({ taskId: z.string().guid(), studentId: z.string().guid().optional() });

async function loadTask(db: Db, schoolId: string, taskId: string) {
  const { data: task, error } = await db
    .from("siga_class_tasks")
    .select("id, class_subject_id, status, due_on, accepts_late, title")
    .eq("school_id", schoolId)
    .eq("id", taskId)
    .maybeSingle();
  if (error) throw publicDatabaseError(error, "Não foi possível ler a tarefa.");
  if (!task) throw new Error("Tarefa não encontrada.");
  const { data: classSubject, error: csError } = await db
    .from("class_subjects")
    .select("id, class_group_id, teacher_id")
    .eq("school_id", schoolId)
    .eq("id", task.class_subject_id)
    .maybeSingle();
  if (csError) throw publicDatabaseError(csError, "Não foi possível ler a disciplina da turma.");
  if (!classSubject) throw new Error("Tarefa não encontrada.");
  return { task, classSubject };
}

/** Administrador/Secretaria sempre; Professor só na disciplina que lecciona. */
async function requireTaskManager(userId: string, taskId: string) {
  const membership = await resolveSgaMembershipAdmin(userId);
  if (!membership) throw new Error("Sem vínculo activo com uma escola.");
  const db = await loadSgaAdminClient();
  const loaded = await loadTask(db, membership.schoolId, taskId);
  const roles: string[] = membership.allAppRoles ?? [membership.appRole];
  if (!roles.some((role) => MANAGER_ROLES.includes(role))) {
    const own = await ownTeacherId(db, membership.schoolId, userId);
    if (!own || own !== str(loaded.classSubject.teacher_id)) {
      throw new Error("Só o professor desta disciplina (ou a direcção) pode ver estas entregas.");
    }
  }
  return { db, schoolId: membership.schoolId, ...loaded };
}

async function readSubmissions(db: Db, schoolId: string, taskId: string, enrollmentId?: string) {
  let query = db
    .from("siga_class_task_submissions")
    .select(SUBMISSION_COLUMNS)
    .eq("school_id", schoolId)
    .eq("task_id", taskId);
  if (enrollmentId) query = query.eq("enrollment_id", enrollmentId);
  const { data, error } = await query;
  if (error) throw publicDatabaseError(error, "Não foi possível ler as entregas.");
  return (data ?? []) as unknown as SubmissionRow[];
}

export type TaskSubmissionLine = {
  enrollmentId: string;
  studentName: string;
  submission: SubmissionRow | null;
  attempts: number;
};

/** Professor/direcção: a turma inteira, com a última tentativa de cada aluno. */
export const listTaskSubmissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => taskInput.parse(input))
  .handler(async ({ data, context }) => {
    const { db, schoolId, classSubject } = await requireTaskManager(context.userId, data.taskId);
    const { data: enrollments, error } = await db
      .from("enrollments")
      .select("id, student_id")
      .eq("school_id", schoolId)
      .eq("class_group_id", classSubject.class_group_id)
      .eq("status", "active");
    if (error) throw publicDatabaseError(error, "Não foi possível ler os alunos da turma.");
    const studentIds = (enrollments ?? []).map((row) => str(row.student_id));
    const { data: students } = studentIds.length
      ? await db
          .from("students")
          .select("id, person_id")
          .eq("school_id", schoolId)
          .in("id", studentIds)
      : { data: [] as Row[] };
    const personIds = (students ?? []).map((row) => str((row as Row).person_id));
    const { data: people } = personIds.length
      ? await db
          .from("people")
          .select("id, full_name")
          .eq("school_id", schoolId)
          .in("id", personIds)
      : { data: [] as Row[] };
    const nameOfPerson = new Map((people ?? []).map((row) => [str(row.id), str(row.full_name)]));
    const personOf = new Map(
      ((students ?? []) as Row[]).map((row) => [str(row.id), str(row.person_id)]),
    );

    const rows = await readSubmissions(db, schoolId, data.taskId);
    const latest = latestByEnrollment(rows);
    const attempts = new Map<string, number>();
    for (const row of rows)
      attempts.set(row.enrollment_id, (attempts.get(row.enrollment_id) ?? 0) + 1);

    return ((enrollments ?? []) as Row[])
      .map((row): TaskSubmissionLine => ({
        enrollmentId: str(row.id),
        studentName: nameOfPerson.get(personOf.get(str(row.student_id)) ?? "") || "—",
        submission: latest.get(str(row.id)) ?? null,
        attempts: attempts.get(str(row.id)) ?? 0,
      }))
      .sort((a, b) => a.studentName.localeCompare(b.studentName, "pt"));
  });

/** Professor: o aluno entregou em papel (primário, sem plataforma em casa). */
export const recordPaperSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ taskId: z.string().guid(), enrollmentId: z.string().guid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { db, schoolId, task, classSubject } = await requireTaskManager(
      context.userId,
      data.taskId,
    );
    const { data: enrollment } = await db
      .from("enrollments")
      .select("id")
      .eq("school_id", schoolId)
      .eq("id", data.enrollmentId)
      .eq("class_group_id", classSubject.class_group_id)
      .eq("status", "active")
      .maybeSingle();
    if (!enrollment) throw new Error("O aluno não está matriculado nesta turma.");
    const latest = latestByEnrollment(
      await readSubmissions(db, schoolId, data.taskId, data.enrollmentId),
    ).get(data.enrollmentId);
    const now = new Date().toISOString();
    // O professor regista o que recebeu: o prazo não o impede, só fica marcado.
    const decision = decideSubmission({
      taskStatus: str(task.status),
      dueOn: task.due_on ? str(task.due_on) : null,
      acceptsLate: true,
      latest: latest ?? null,
      now,
    });
    if (!decision.ok) throw new Error(decision.reason);
    const { error } = await db.from("siga_class_task_submissions").insert({
      school_id: schoolId,
      task_id: data.taskId,
      enrollment_id: data.enrollmentId,
      attempt: decision.attempt,
      status: "submitted",
      on_paper: true,
      submitted_at: now,
      is_late: decision.late,
      created_by: context.userId,
      updated_by: context.userId,
    });
    if (error) throw publicDatabaseError(error, "Não foi possível registar a entrega.");
    return { attempt: decision.attempt };
  });

/** Professor: devolve a entrega; só então o aluno vê a nota e o comentário. */
export const returnTaskSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        taskId: z.string().guid(),
        submissionId: z.string().guid(),
        grade: z.number().min(0).max(20).optional(),
        feedback: z.string().trim().max(2000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { db, schoolId } = await requireTaskManager(context.userId, data.taskId);
    const { data: updated, error } = await db
      .from("siga_class_task_submissions")
      .update({
        status: "returned",
        returned_at: new Date().toISOString(),
        grade: data.grade ?? null,
        feedback: data.feedback || null,
        graded_by: context.userId,
        updated_by: context.userId,
      })
      .eq("school_id", schoolId)
      .eq("task_id", data.taskId)
      .eq("id", data.submissionId)
      .eq("status", "submitted")
      .select("id")
      .maybeSingle();
    if (error) throw publicDatabaseError(error, "Não foi possível devolver a entrega.");
    if (!updated) throw new Error("Esta entrega já foi devolvida ou não existe.");
    return { ok: true };
  });

/** A matrícula activa do aluno na turma da tarefa, vista pelo aluno ou pelo encarregado. */
async function resolveOwnEnrollment(userId: string, taskId: string, studentId?: string) {
  const visible = await resolveVisibleStudent(userId, studentId);
  if (!visible) throw new Error("Tarefa não encontrada.");
  const { db, schoolId } = visible;
  const { task, classSubject } = await loadTask(db, schoolId, taskId);
  const { data: enrollment } = await db
    .from("enrollments")
    .select("id")
    .eq("school_id", schoolId)
    .eq("student_id", visible.studentId)
    .eq("class_group_id", classSubject.class_group_id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (!enrollment) throw new Error("Tarefa não encontrada.");
  return { db, schoolId, task, enrollmentId: str(enrollment.id) };
}

/** Aluno/encarregado: a entrega do aluno nesta tarefa. */
export const getMyTaskSubmission = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => taskInput.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await resolveSgaMembershipAdmin(context.userId);
    const { db, schoolId, task, enrollmentId } = await resolveOwnEnrollment(
      context.userId,
      data.taskId,
      data.studentId,
    );
    const latest =
      latestByEnrollment(await readSubmissions(db, schoolId, data.taskId, enrollmentId)).get(
        enrollmentId,
      ) ?? null;
    return {
      submission: studentView(latest),
      // Só o próprio aluno entrega; o encarregado acompanha.
      canSubmit: membership?.appRole === "Aluno",
      acceptsLate: task.accepts_late !== false,
      dueOn: task.due_on ? str(task.due_on) : null,
    };
  });

/** Aluno: entrega (ou reenvia, até o professor devolver). */
export const submitTaskWork = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ taskId: z.string().guid(), body: z.string().trim().min(1).max(4000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (membership?.appRole !== "Aluno") throw new Error("Só o aluno pode entregar o trabalho.");
    const { db, schoolId, task, enrollmentId } = await resolveOwnEnrollment(
      context.userId,
      data.taskId,
    );
    const latest =
      latestByEnrollment(await readSubmissions(db, schoolId, data.taskId, enrollmentId)).get(
        enrollmentId,
      ) ?? null;
    const now = new Date().toISOString();
    const decision = decideSubmission({
      taskStatus: str(task.status),
      dueOn: task.due_on ? str(task.due_on) : null,
      acceptsLate: task.accepts_late !== false,
      latest,
      now,
    });
    if (!decision.ok) throw new Error(decision.reason);
    const { error } = await db.from("siga_class_task_submissions").insert({
      school_id: schoolId,
      task_id: data.taskId,
      enrollment_id: enrollmentId,
      attempt: decision.attempt,
      status: "submitted",
      body: data.body,
      submitted_at: now,
      is_late: decision.late,
      created_by: context.userId,
      updated_by: context.userId,
    });
    // Dois envios no mesmo instante: a base recusa a tentativa repetida.
    if (error?.code === "23505") throw new Error("A entrega já foi registada. Actualize a página.");
    if (error) throw publicDatabaseError(error, "Não foi possível entregar o trabalho.");
    return { attempt: decision.attempt, late: decision.late };
  });
