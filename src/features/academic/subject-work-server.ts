/**
 * Os trabalhos de uma disciplina, vistos pelo aluno (ou pelo encarregado): todos,
 * também os que já passaram do prazo ou foram arquivados, com cada tentativa de
 * entrega. O detalhe da aula só mostra os que ainda estão por fazer; o histórico
 * vive aqui. Leitura apenas: entregar continua em `submitTaskWork`.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { resolveSgaMembershipAdmin } from "@/integrations/supabase/sga-admin";
import { resolveVisibleStudent } from "@/features/dashboard/student-access";
import { todayInLuanda } from "@/features/calendar/dates";
import { loadAttachmentInfo } from "./task-attachment-store";
import {
  latestByEnrollment,
  studentView,
  summarizeWork,
  taskState,
  type SubmissionRow,
  type TaskState,
  type WorkSummary,
} from "./task-submissions";

type Row = Record<string, unknown>;
const str = (value: unknown) => (value == null ? "" : String(value));

const SUBMISSION_COLUMNS =
  "id, task_id, enrollment_id, attempt, status, submitted_at, is_late, on_paper, body, grade, feedback, returned_at, file_id";

export type SubjectWorkTask = {
  id: string;
  title: string;
  kind: string;
  description: string | null;
  dueOn: string | null;
  archived: boolean;
  acceptsLate: boolean;
  countsForPauta: boolean;
  state: TaskState;
  latest: ReturnType<typeof studentView>;
  /** Todas as tentativas, da mais recente para a mais antiga. */
  attempts: Array<NonNullable<ReturnType<typeof studentView>>>;
};

export type SubjectWork = {
  subjectName: string;
  canSubmit: boolean;
  summary: WorkSummary;
  tasks: SubjectWorkTask[];
};

const EMPTY: SubjectWork = {
  subjectName: "",
  canSubmit: false,
  summary: { total: 0, delivered: 0, returned: 0, late: 0, average: null },
  tasks: [],
};

export const getMySubjectWork = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({ subjectId: z.string().guid(), studentId: z.string().guid().optional() })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<SubjectWork> => {
    const visible = await resolveVisibleStudent(context.userId, data.studentId);
    if (!visible) return EMPTY;
    const { db, schoolId, studentId } = visible;

    const { data: subject, error: subjectError } = await db
      .from("subjects")
      .select("id, name")
      .eq("school_id", schoolId)
      .eq("id", data.subjectId)
      .maybeSingle();
    if (subjectError) throw publicDatabaseError(subjectError, "Não foi possível ler a disciplina.");
    if (!subject) return EMPTY;

    // Todas as matrículas (anos anteriores incluídos): o histórico não se perde.
    const { data: enrollments, error: enrollmentError } = await db
      .from("enrollments")
      .select("id, class_group_id")
      .eq("school_id", schoolId)
      .eq("student_id", studentId)
      .neq("status", "cancelled");
    if (enrollmentError) {
      throw publicDatabaseError(enrollmentError, "Não foi possível ler as matrículas.");
    }
    const enrollmentOfGroup = new Map(
      ((enrollments ?? []) as Row[]).map((row) => [str(row.class_group_id), str(row.id)]),
    );
    const membership = await resolveSgaMembershipAdmin(context.userId);
    const base = {
      ...EMPTY,
      subjectName: str(subject.name),
      canSubmit: membership?.appRole === "Aluno",
    };
    if (!enrollmentOfGroup.size) return base;

    const { data: classSubjects, error: csError } = await db
      .from("class_subjects")
      .select("id, class_group_id")
      .eq("school_id", schoolId)
      .eq("subject_id", data.subjectId)
      .in("class_group_id", [...enrollmentOfGroup.keys()]);
    if (csError) throw publicDatabaseError(csError, "Não foi possível ler a disciplina da turma.");
    const groupOfClassSubject = new Map(
      ((classSubjects ?? []) as Row[]).map((row) => [str(row.id), str(row.class_group_id)]),
    );
    if (!groupOfClassSubject.size) return base;

    const { data: tasks, error: taskError } = await db
      .from("siga_class_tasks")
      .select(
        "id, class_subject_id, kind, title, description, due_on, status, accepts_late, assessment_item_id, created_at",
      )
      .eq("school_id", schoolId)
      .in("class_subject_id", [...groupOfClassSubject.keys()])
      .order("created_at", { ascending: false })
      .limit(200);
    if (taskError) throw publicDatabaseError(taskError, "Não foi possível ler os trabalhos.");
    const taskRows = (tasks ?? []) as Row[];
    if (!taskRows.length) return base;

    const enrollmentIds = [...new Set(enrollmentOfGroup.values())];
    const { data: submissions, error: subError } = await db
      .from("siga_class_task_submissions")
      .select(SUBMISSION_COLUMNS)
      .eq("school_id", schoolId)
      .in(
        "task_id",
        taskRows.map((row) => str(row.id)),
      )
      .in("enrollment_id", enrollmentIds);
    if (subError) throw publicDatabaseError(subError, "Não foi possível ler as entregas.");
    const submissionRows = (submissions ?? []) as unknown as Array<
      SubmissionRow & { task_id: string }
    >;
    const files = await loadAttachmentInfo(
      db,
      schoolId,
      submissionRows.map((row) => row.file_id),
    );
    const byTask = new Map<string, SubmissionRow[]>();
    for (const row of submissionRows) {
      const list = byTask.get(row.task_id) ?? [];
      list.push({ ...row, file: row.file_id ? (files.get(row.file_id) ?? null) : null });
      byTask.set(row.task_id, list);
    }

    const today = todayInLuanda();
    const result: SubjectWorkTask[] = taskRows.map((task) => {
      const enrollmentId = enrollmentOfGroup.get(
        groupOfClassSubject.get(str(task.class_subject_id)) ?? "",
      );
      const rows = (byTask.get(str(task.id)) ?? []).filter(
        (row) => row.enrollment_id === enrollmentId,
      );
      const latest = latestByEnrollment(rows).get(enrollmentId ?? "") ?? null;
      const dueOn = task.due_on ? str(task.due_on) : null;
      const acceptsLate = task.accepts_late !== false;
      return {
        id: str(task.id),
        title: str(task.title),
        kind: str(task.kind) || "outra",
        description: task.description ? str(task.description) : null,
        dueOn,
        archived: str(task.status) !== "published",
        acceptsLate,
        countsForPauta: Boolean(task.assessment_item_id),
        state: taskState({ taskStatus: str(task.status), dueOn, acceptsLate, latest, today }),
        latest: studentView(latest),
        attempts: [...rows].sort((a, b) => b.attempt - a.attempt).map((row) => studentView(row)!),
      };
    });
    // Primeiro o que pede acção (por entregar), depois o resto pelo prazo mais recente.
    const order: Record<TaskState, number> = {
      overdue: 0,
      open: 1,
      submitted: 2,
      returned: 3,
      missed: 4,
    };
    result.sort(
      (a, b) => order[a.state] - order[b.state] || (b.dueOn ?? "").localeCompare(a.dueOn ?? ""),
    );
    return {
      ...base,
      summary: summarizeWork(
        result.length,
        result.map((task) =>
          task.latest
            ? {
                status: task.latest.status,
                is_late: task.latest.isLate,
                grade: task.latest.grade,
              }
            : null,
        ),
      ),
      tasks: result,
    };
  });
