/**
 * Entregas de trabalhos. A tabela é só do servidor (migração 20261025140000): sem
 * políticas e sem privilégios para authenticated. Aqui decide-se quem pode o quê:
 *
 * - Professor da disciplina naquela turma, Administrador ou Secretaria: vê as
 *   entregas da turma, regista a entrega em papel e devolve com nota e comentário.
 * - Aluno: entrega na sua matrícula activa da turma da tarefa.
 * - Encarregado: vê a entrega do educando, não entrega por ele.
 *
 * Uma tarefa ligada a uma avaliação (`assessment_item_id`) leva a nota devolvida
 * à pauta pelo mesmo caminho do lançamento (`writeAssessmentScores`): cotação,
 * período aberto e pauta homologada valem aqui como lá.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import {
  assertTenantAllowsWrites,
  loadSgaAdminClient,
  requireSgaWriterForWrite,
  resolveSgaMembershipAdmin,
} from "@/integrations/supabase/sga-admin";
import { resolveVisibleStudent } from "@/features/dashboard/student-access";
import { writeAssessmentScores } from "./assessment-score-write";
import { TASK_KINDS } from "./lesson-messages";
import { ownTeacherId } from "./own-teacher";
import {
  decideSubmission,
  latestByEnrollment,
  studentView,
  summarizeWork,
  type SubmissionRow,
} from "./task-submissions";
import { ATTACHMENT_TYPES, MAX_ATTACHMENT_BASE64 } from "./task-attachments";
import {
  FILES_BUCKET,
  discardTaskAttachment,
  loadAttachmentInfo,
  storeTaskAttachment,
} from "./task-attachment-store";

type Db = Awaited<ReturnType<typeof loadSgaAdminClient>>;
type Row = Record<string, unknown>;
const str = (value: unknown) => (value == null ? "" : String(value));

const MANAGER_ROLES = ["Administrador", "Secretaria"] as const;
const SUBMISSION_COLUMNS =
  "id, enrollment_id, attempt, status, submitted_at, is_late, on_paper, body, grade, feedback, returned_at, file_id";

const taskInput = z.object({ taskId: z.string().guid(), studentId: z.string().guid().optional() });

async function loadTask(db: Db, schoolId: string, taskId: string) {
  const { data: task, error } = await db
    .from("siga_class_tasks")
    .select(
      "id, class_subject_id, status, due_on, accepts_late, title, kind, description, assessment_item_id",
    )
    .eq("school_id", schoolId)
    .eq("id", taskId)
    .maybeSingle();
  if (error) throw publicDatabaseError(error, "Não foi possível ler a tarefa.");
  if (!task) throw new Error("Tarefa não encontrada.");
  const { data: classSubject, error: csError } = await db
    .from("class_subjects")
    .select("id, class_group_id, subject_id, teacher_id")
    .eq("school_id", schoolId)
    .eq("id", task.class_subject_id)
    .maybeSingle();
  if (csError) throw publicDatabaseError(csError, "Não foi possível ler a disciplina da turma.");
  if (!classSubject) throw new Error("Tarefa não encontrada.");
  return { task, classSubject };
}

/**
 * Administrador/Secretaria sempre; Professor só na disciplina que lecciona. Em
 * escrita, o guarda da pauta: módulo não retirado e escola que pode gravar.
 */
async function requireTaskManager(userId: string, taskId: string, mode: "read" | "write") {
  const membership =
    mode === "write"
      ? await requireSgaWriterForWrite("pedagogica", userId, [...MANAGER_ROLES, "Professor"])
      : await resolveSgaMembershipAdmin(userId);
  if (!membership) throw new Error("Sem vínculo activo com uma escola.");
  const db = await loadSgaAdminClient();
  const loaded = await loadTask(db, membership.schoolId, taskId);
  const roles: string[] = membership.allAppRoles ?? [membership.appRole];
  if (!roles.some((role) => (MANAGER_ROLES as readonly string[]).includes(role))) {
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
  const rows = (data ?? []) as unknown as SubmissionRow[];
  const files = await loadAttachmentInfo(
    db,
    schoolId,
    rows.map((row) => row.file_id),
  );
  return rows.map((row) => ({
    ...row,
    file: row.file_id ? (files.get(row.file_id) ?? null) : null,
  }));
}

export type TaskSubmissionLine = {
  enrollmentId: string;
  studentName: string;
  submission: SubmissionRow | null;
  attempts: number;
  /** Todas as tentativas, da mais recente para a mais antiga. */
  history: SubmissionRow[];
  /** A nota desta tarefa já na pauta, quando a tarefa conta para uma avaliação. */
  pautaScore: number | null;
};

export type TaskAssessmentOption = {
  id: string;
  name: string;
  term: number;
  maxScore: number | null;
};

/** As avaliações da mesma turma e disciplina: as únicas a que a tarefa pode contar. */
async function loadAssessmentOptions(
  db: Db,
  schoolId: string,
  classSubject: { class_group_id: unknown; subject_id: unknown },
): Promise<TaskAssessmentOption[]> {
  const { data, error } = await db
    .from("siga_assessment_items")
    .select("id, name, term, max_score")
    .eq("school_id", schoolId)
    .eq("class_group_id", str(classSubject.class_group_id))
    .eq("subject_id", str(classSubject.subject_id))
    .order("term")
    .limit(100);
  if (error) throw publicDatabaseError(error, "Não foi possível ler as avaliações da disciplina.");
  return ((data ?? []) as Row[]).map((row) => ({
    id: str(row.id),
    name: str(row.name),
    term: Number(row.term),
    maxScore: row.max_score == null ? null : Number(row.max_score),
  }));
}

/** Professor/direcção: a turma inteira, com a última tentativa de cada aluno. */
export const listTaskSubmissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => taskInput.parse(input))
  .handler(async ({ data, context }) => {
    const { db, schoolId, task, classSubject } = await requireTaskManager(
      context.userId,
      data.taskId,
      "read",
    );
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

    const assessmentOptions = await loadAssessmentOptions(db, schoolId, classSubject);
    const assessmentItemId = str(task.assessment_item_id);
    const pautaScores = new Map<string, number | null>();
    if (assessmentItemId) {
      const { data: scores, error: scoresError } = await db
        .from("siga_assessment_scores")
        .select("enrollment_id, score")
        .eq("school_id", schoolId)
        .eq("item_id", assessmentItemId);
      if (scoresError) throw publicDatabaseError(scoresError, "Não foi possível ler a pauta.");
      for (const row of (scores ?? []) as Row[])
        pautaScores.set(str(row.enrollment_id), row.score == null ? null : Number(row.score));
    }

    const lines = ((enrollments ?? []) as Row[])
      .map((row): TaskSubmissionLine => ({
        enrollmentId: str(row.id),
        studentName: nameOfPerson.get(personOf.get(str(row.student_id)) ?? "") || "—",
        submission: latest.get(str(row.id)) ?? null,
        attempts: attempts.get(str(row.id)) ?? 0,
        history: rows
          .filter((sub) => sub.enrollment_id === str(row.id))
          .sort((a, b) => b.attempt - a.attempt),
        pautaScore: pautaScores.get(str(row.id)) ?? null,
      }))
      .sort((a, b) => a.studentName.localeCompare(b.studentName, "pt"));
    return {
      title: str(task.title),
      kind: str(task.kind) || "outra",
      description: task.description ? str(task.description) : null,
      archived: str(task.status) !== "published",
      dueOn: task.due_on ? str(task.due_on) : null,
      acceptsLate: task.accepts_late !== false,
      summary: summarizeWork(
        lines.length,
        lines.map((line) => line.submission),
      ),
      assessment: assessmentOptions.find((option) => option.id === assessmentItemId) ?? null,
      assessmentOptions,
      lines,
    };
  });

/** Professor/direcção: a tarefa passa a contar (ou deixa de contar) para uma avaliação. */
export const linkTaskAssessment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ taskId: z.string().guid(), itemId: z.string().guid().nullable() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { db, schoolId, classSubject } = await requireTaskManager(
      context.userId,
      data.taskId,
      "write",
    );
    if (data.itemId) {
      const options = await loadAssessmentOptions(db, schoolId, classSubject);
      if (!options.some((option) => option.id === data.itemId)) {
        throw new Error("Essa avaliação não é desta turma e disciplina.");
      }
    }
    const { error } = await db
      .from("siga_class_tasks")
      .update({ assessment_item_id: data.itemId, updated_by: context.userId })
      .eq("school_id", schoolId)
      .eq("id", data.taskId);
    if (error) throw publicDatabaseError(error, "Não foi possível ligar a tarefa à avaliação.");
    return { ok: true };
  });

/** Professor/direcção: título, tipo, descrição, prazo, atrasos e arquivar/reabrir. */
export const updateTaskSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        taskId: z.string().guid(),
        title: z.string().trim().min(2).max(160),
        kind: z.enum(TASK_KINDS),
        description: z.string().trim().max(2000).nullable(),
        dueOn: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable(),
        acceptsLate: z.boolean(),
        archived: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { db, schoolId } = await requireTaskManager(context.userId, data.taskId, "write");
    const { error } = await db
      .from("siga_class_tasks")
      .update({
        title: data.title,
        kind: data.kind,
        description: data.description || null,
        due_on: data.dueOn,
        accepts_late: data.acceptsLate,
        status: data.archived ? "archived" : "published",
        updated_by: context.userId,
      })
      .eq("school_id", schoolId)
      .eq("id", data.taskId);
    if (error) throw publicDatabaseError(error, "Não foi possível guardar o trabalho.");
    return { ok: true };
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
      "write",
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
    const { db, schoolId, task } = await requireTaskManager(context.userId, data.taskId, "write");
    const { data: current, error: currentError } = await db
      .from("siga_class_task_submissions")
      .select("id, enrollment_id, status")
      .eq("school_id", schoolId)
      .eq("task_id", data.taskId)
      .eq("id", data.submissionId)
      .maybeSingle();
    if (currentError) throw publicDatabaseError(currentError, "Não foi possível ler a entrega.");
    if (!current || current.status !== "submitted") {
      throw new Error("Esta entrega já foi devolvida ou não existe.");
    }
    // Primeiro a pauta: se a pauta recusa (período fechado, cotação), a entrega
    // não fica devolvida com uma nota que não chegou à pauta. Repetir é seguro.
    const itemId = str(task.assessment_item_id);
    const toPauta = Boolean(itemId) && data.grade != null;
    if (toPauta) {
      await writeAssessmentScores(db, {
        schoolId,
        userId: context.userId,
        itemId,
        rows: [{ enrollmentId: str(current.enrollment_id), score: data.grade ?? null }],
      });
    }
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
    return { ok: true, pauta: toPauta };
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
  return { db, schoolId, task, classSubject, enrollmentId: str(enrollment.id) };
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

const attachmentInput = z.object({
  name: z.string().max(255),
  contentType: z.enum(ATTACHMENT_TYPES as [string, ...string[]], {
    message: "Envie um PDF ou uma imagem (JPG, PNG, WebP).",
  }),
  base64: z.string().min(1).max(MAX_ATTACHMENT_BASE64, "O anexo deve ter no máximo 5 MB."),
});

/** Aluno: entrega (ou reenvia, até o professor devolver), com texto, anexo ou os dois. */
export const submitTaskWork = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        taskId: z.string().guid(),
        body: z.string().trim().max(4000).optional(),
        attachment: attachmentInput.optional(),
      })
      .refine((value) => Boolean(value.body) || Boolean(value.attachment), {
        message: "Escreva a resposta ou anexe o trabalho.",
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (membership?.appRole !== "Aluno") throw new Error("Só o aluno pode entregar o trabalho.");
    const { db, schoolId, task, classSubject, enrollmentId } = await resolveOwnEnrollment(
      context.userId,
      data.taskId,
    );
    // Escola suspensa ou arquivada: consulta-se, não se grava.
    await assertTenantAllowsWrites(schoolId);
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
    // O anexo só se guarda depois de a entrega ser aceite; se a entrega falhar, sai.
    const stored = data.attachment
      ? await storeTaskAttachment(db, {
          schoolId,
          userId: context.userId,
          taskId: data.taskId,
          enrollmentId,
          classGroupId: str(classSubject.class_group_id) || null,
          title: str(task.title),
          upload: data.attachment as Parameters<typeof storeTaskAttachment>[1]["upload"],
        })
      : null;
    const { error } = await db.from("siga_class_task_submissions").insert({
      school_id: schoolId,
      task_id: data.taskId,
      enrollment_id: enrollmentId,
      attempt: decision.attempt,
      status: "submitted",
      body: data.body || null,
      file_id: stored?.fileId ?? null,
      submitted_at: now,
      is_late: decision.late,
      created_by: context.userId,
      updated_by: context.userId,
    });
    if (error && stored) await discardTaskAttachment(db, schoolId, stored);
    // Dois envios no mesmo instante: a base recusa a tentativa repetida.
    if (error?.code === "23505") throw new Error("A entrega já foi registada. Actualize a página.");
    if (error) throw publicDatabaseError(error, "Não foi possível entregar o trabalho.");
    return { attempt: decision.attempt, late: decision.late };
  });

/**
 * Abrir o anexo de uma entrega: o professor da disciplina e a direcção, o próprio
 * aluno e o seu encarregado. URL assinado por 10 minutos.
 */
export const openTaskSubmissionFile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ taskId: z.string().guid(), submissionId: z.string().guid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem vínculo activo com uma escola.");
    const db = await loadSgaAdminClient();
    const { data: submission, error } = await db
      .from("siga_class_task_submissions")
      .select("id, enrollment_id, file_id")
      .eq("school_id", membership.schoolId)
      .eq("task_id", data.taskId)
      .eq("id", data.submissionId)
      .maybeSingle();
    if (error) throw publicDatabaseError(error, "Não foi possível abrir o anexo.");
    if (!submission?.file_id) throw new Error("Anexo não encontrado.");

    const isFamily = ["Aluno", "Encarregado"].includes(membership.appRole);
    if (isFamily) {
      const { data: enrollment } = await db
        .from("enrollments")
        .select("student_id")
        .eq("school_id", membership.schoolId)
        .eq("id", str(submission.enrollment_id))
        .maybeSingle();
      const visible = enrollment?.student_id
        ? await resolveVisibleStudent(context.userId, str(enrollment.student_id))
        : null;
      if (!visible) throw new Error("Sem permissão para abrir este anexo.");
    } else {
      // Professor de outra disciplina: recusado, como nas entregas.
      await requireTaskManager(context.userId, data.taskId, "read");
    }

    const { data: file, error: fileError } = await db
      .from("siga_files")
      .select("name, storage_backend, storage_path, deleted_at")
      .eq("school_id", membership.schoolId)
      .eq("id", str(submission.file_id))
      .maybeSingle();
    if (fileError) throw publicDatabaseError(fileError, "Não foi possível abrir o anexo.");
    if (!file || file.deleted_at || file.storage_backend !== "sga") {
      throw new Error("O anexo já não existe.");
    }
    const signed = await db.storage.from(FILES_BUCKET).createSignedUrl(str(file.storage_path), 600);
    if (signed.error || !signed.data?.signedUrl) throw new Error("Não foi possível abrir o anexo.");
    return { url: signed.data.signedUrl, name: str(file.name) };
  });
