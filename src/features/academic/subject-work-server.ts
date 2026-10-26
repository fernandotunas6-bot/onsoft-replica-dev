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
import { readAllPages, readInChunks } from "@/integrations/supabase/read-all-pages";
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
  /** Já não recebe entregas: arquivado, ou de uma matrícula que já não está activa. */
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

type VisibleDb = NonNullable<Awaited<ReturnType<typeof resolveVisibleStudent>>>["db"];

/** Ordem da lista: primeiro o que pede acção (por entregar), depois o resto pelo prazo. */
const STATE_ORDER: Record<TaskState, number> = {
  overdue: 0,
  open: 1,
  submitted: 2,
  returned: 3,
  missed: 4,
};

/**
 * Os trabalhos das disciplinas-turma indicadas, com a entrega mais recente do aluno
 * e o estado de cada um. Partilhado pela página da disciplina e pela visão geral da
 * app móvel, para as duas dizerem o mesmo de cada trabalho.
 */
async function loadWorkTasks(
  db: VisibleDb,
  schoolId: string,
  ctx: {
    /** class_group_id → id da matrícula do aluno nessa turma. */
    enrollmentOfGroup: Map<string, string>;
    /** Matrículas activas: só nelas se entrega. */
    activeEnrollments: Set<string>;
    /** class_subject_id → class_group_id. */
    groupOfClassSubject: Map<string, string>;
  },
): Promise<Array<{ task: SubjectWorkTask; classSubjectId: string }>> {
  const { enrollmentOfGroup, activeEnrollments, groupOfClassSubject } = ctx;
  if (!groupOfClassSubject.size) return [];
  // O histórico inteiro, por páginas: o resumo e a média contam todos os
  // trabalhos, não só os 200 mais recentes.
  const { data: taskRows, error: taskError } = await readAllPages<Row>((from, to) =>
    db
      .from("siga_class_tasks")
      .select(
        "id, class_subject_id, kind, title, description, due_on, status, accepts_late, assessment_item_id, created_at",
      )
      .eq("school_id", schoolId)
      .in("class_subject_id", [...groupOfClassSubject.keys()])
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to),
  );
  if (taskError) throw publicDatabaseError(taskError, "Não foi possível ler os trabalhos.");
  if (!taskRows.length) return [];

  const enrollmentIds = [...new Set(enrollmentOfGroup.values())];
  // Várias tentativas por trabalho: dentro de cada lote de ids, também por páginas.
  const { data: submissions, error: subError } = await readInChunks(
    taskRows.map((row) => str(row.id)),
    (ids) =>
      readAllPages((from, to) =>
        db
          .from("siga_class_task_submissions")
          .select(SUBMISSION_COLUMNS)
          .eq("school_id", schoolId)
          .in("task_id", ids)
          .in("enrollment_id", enrollmentIds)
          .order("id", { ascending: true })
          .range(from, to),
      ),
  );
  if (subError) throw publicDatabaseError(subError, "Não foi possível ler as entregas.");
  const submissionRows = submissions as unknown as Array<SubmissionRow & { task_id: string }>;
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
  const result = taskRows.map((task) => {
    const enrollmentId = enrollmentOfGroup.get(
      groupOfClassSubject.get(str(task.class_subject_id)) ?? "",
    );
    const rows = (byTask.get(str(task.id)) ?? []).filter(
      (row) => row.enrollment_id === enrollmentId,
    );
    const latest = latestByEnrollment(rows).get(enrollmentId ?? "") ?? null;
    const dueOn = task.due_on ? str(task.due_on) : null;
    const acceptsLate = task.accepts_late !== false;
    const open = activeEnrollments.has(enrollmentId ?? "") && str(task.status) === "published";
    const view: SubjectWorkTask = {
      id: str(task.id),
      title: str(task.title),
      kind: str(task.kind) || "outra",
      description: task.description ? str(task.description) : null,
      dueOn,
      archived: !open,
      acceptsLate,
      countsForPauta: Boolean(task.assessment_item_id),
      state: taskState({
        taskStatus: open ? "published" : "archived",
        dueOn,
        acceptsLate,
        latest,
        today,
      }),
      latest: studentView(latest),
      attempts: [...rows].sort((a, b) => b.attempt - a.attempt).map((row) => studentView(row)!),
    };
    return { task: view, classSubjectId: str(task.class_subject_id) };
  });
  result.sort(
    (a, b) =>
      STATE_ORDER[a.task.state] - STATE_ORDER[b.task.state] ||
      (b.task.dueOn ?? "").localeCompare(a.task.dueOn ?? ""),
  );
  return result;
}

function summarizeTasks(tasks: SubjectWorkTask[]): WorkSummary {
  return summarizeWork(
    tasks.length,
    tasks.map((task) =>
      task.latest
        ? { status: task.latest.status, is_late: task.latest.isLate, grade: task.latest.grade }
        : null,
    ),
  );
}

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
      .select("id, class_group_id, status")
      .eq("school_id", schoolId)
      .eq("student_id", studentId)
      .neq("status", "cancelled");
    if (enrollmentError) {
      throw publicDatabaseError(enrollmentError, "Não foi possível ler as matrículas.");
    }
    const enrollmentOfGroup = new Map(
      ((enrollments ?? []) as Row[]).map((row) => [str(row.class_group_id), str(row.id)]),
    );
    // Só se entrega na matrícula activa (submitTaskWork): um trabalho de um ano já
    // fechado que ficou por entregar é «não entregue», não «atrasado».
    const activeEnrollments = new Set(
      ((enrollments ?? []) as Row[])
        .filter((row) => str(row.status) === "active")
        .map((row) => str(row.id)),
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

    const result = (
      await loadWorkTasks(db, schoolId, {
        enrollmentOfGroup,
        activeEnrollments,
        groupOfClassSubject,
      })
    ).map((entry) => entry.task);
    if (!result.length) return base;
    return { ...base, summary: summarizeTasks(result), tasks: result };
  });

export type WorkOverviewTask = SubjectWorkTask & { subjectId: string; subjectName: string };

export type WorkOverview = {
  canSubmit: boolean;
  summary: WorkSummary;
  /** Do ano corrente (matrículas activas), de todas as disciplinas. */
  tasks: WorkOverviewTask[];
};

/**
 * Os trabalhos do ano corrente do aluno, de todas as disciplinas, num só pedido: a
 * vista «Trabalhos» da app móvel, onde um pedido por disciplina custava caro em
 * redes lentas. O detalhe e o histórico de anos anteriores continuam na página da
 * disciplina (`getMySubjectWork`). Mesma regra de acesso: o aluno, ou o encarregado
 * do educando.
 */
export const getMyWorkOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ studentId: z.string().guid().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<WorkOverview> => {
    const empty: WorkOverview = { canSubmit: false, summary: EMPTY.summary, tasks: [] };
    const visible = await resolveVisibleStudent(context.userId, data.studentId);
    if (!visible) return empty;
    const { db, schoolId, studentId } = visible;

    const { data: enrollments, error: enrollmentError } = await db
      .from("enrollments")
      .select("id, class_group_id")
      .eq("school_id", schoolId)
      .eq("student_id", studentId)
      .eq("status", "active");
    if (enrollmentError) {
      throw publicDatabaseError(enrollmentError, "Não foi possível ler as matrículas.");
    }
    const enrollmentOfGroup = new Map(
      ((enrollments ?? []) as Row[]).map((row) => [str(row.class_group_id), str(row.id)]),
    );
    const membership = await resolveSgaMembershipAdmin(context.userId);
    const base = { ...empty, canSubmit: membership?.appRole === "Aluno" };
    if (!enrollmentOfGroup.size) return base;

    const { data: classSubjects, error: csError } = await db
      .from("class_subjects")
      .select("id, class_group_id, subject_id")
      .eq("school_id", schoolId)
      .in("class_group_id", [...enrollmentOfGroup.keys()]);
    if (csError) throw publicDatabaseError(csError, "Não foi possível ler as disciplinas.");
    const csRows = (classSubjects ?? []) as Row[];
    const groupOfClassSubject = new Map(
      csRows.map((row) => [str(row.id), str(row.class_group_id)]),
    );
    const subjectOfClassSubject = new Map(csRows.map((row) => [str(row.id), str(row.subject_id)]));

    const entries = await loadWorkTasks(db, schoolId, {
      enrollmentOfGroup,
      activeEnrollments: new Set(enrollmentOfGroup.values()),
      groupOfClassSubject,
    });
    if (!entries.length) return base;

    const subjectIds = [
      ...new Set(entries.map((e) => subjectOfClassSubject.get(e.classSubjectId) ?? "")),
    ].filter(Boolean);
    const { data: subjects, error: subjectError } = await db
      .from("subjects")
      .select("id, name")
      .eq("school_id", schoolId)
      .in("id", subjectIds);
    if (subjectError) {
      throw publicDatabaseError(subjectError, "Não foi possível ler as disciplinas.");
    }
    const subjectName = new Map(
      ((subjects ?? []) as Row[]).map((row) => [str(row.id), str(row.name)]),
    );
    const tasks = entries.map(({ task, classSubjectId }) => {
      const subjectId = subjectOfClassSubject.get(classSubjectId) ?? "";
      return { ...task, subjectId, subjectName: subjectName.get(subjectId) ?? "" };
    });
    return { ...base, summary: summarizeTasks(tasks), tasks };
  });
