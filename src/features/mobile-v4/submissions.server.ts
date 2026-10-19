/**
 * Entregas de trabalhos em PDF pela app (Mobile V4).
 *
 * Fluxo do aluno, em dois passos, porque o adaptador HTTP só aceita JSON até
 * 64 KB:
 *
 * 1. `submission-upload` — o servidor confirma a tarefa (publicada, de uma
 *    disciplina do aluno, prazo em aberto) e devolve um URL assinado para
 *    enviar o PDF directamente para o bucket privado `siga-files`, no caminho
 *    `<escola>/<aaaa>/<mm>/submissions/<utilizador>/<id>-<nome>.pdf`.
 * 2. `submission` — o servidor volta a confirmar a tarefa, valida o caminho
 *    (escola e utilizador da sessão), descarrega o objecto e confirma que é
 *    PDF (cabeçalho `%PDF-`) e tem até 10 MB; só então grava ou substitui a
 *    entrega (uma por aluno e tarefa, com versão).
 *
 * O professor lista as entregas das tarefas das suas disciplinas e abre cada
 * PDF por um URL assinado de 10 minutos. A tabela é só do servidor; sem a
 * migração aplicada, tudo responde `SUBMISSIONS_NOT_READY` (503).
 */
import { randomUUID } from "node:crypto";
import type { requireMobileAcademicAccess } from "./authorization";
import type { MobileAcademicScope } from "./academic-scope.server";
import { schoolTodayIso } from "@/lib/school-date";
import { MobileApiError } from "./errors";

type Db = Awaited<ReturnType<typeof requireMobileAcademicAccess>>["db"];
// A tabela ainda não está em `types.ts` (gerado depois de aplicar a migração):
// só para ela, o cliente sem tipos, como em `web-site-content.ts`.
type LooseDb = { from: (table: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
const submissionsTable = (db: Db) => (db as unknown as LooseDb).from("siga_task_submissions");

export const SUBMISSION_BUCKET = "siga-files";
export const SUBMISSION_MAX_BYTES = 10 * 1024 * 1024;
const SIGNED_SECONDS = 600;

type TaskRow = { id: string; class_subject_id: string; due_on: string | null };
type SubmissionRow = {
  id: string;
  task_id: string;
  student_id: string;
  storage_path: string;
  file_name: string;
  size_bytes: number;
  version: number;
  status: string;
  submitted_at: string;
};
const SUBMISSION_FIELDS =
  "id, task_id, student_id, storage_path, file_name, size_bytes, version, status, submitted_at";

/** A tabela ainda não existe (migração por aplicar). */
function isMissingTable(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /siga_task_submissions/.test(error.message ?? "")
  );
}

async function assertReady(db: Db) {
  const probe = await submissionsTable(db).select("id").limit(1);
  if (isMissingTable(probe.error)) throw new MobileApiError(503, "SUBMISSIONS_NOT_READY");
  if (probe.error) throw new MobileApiError(503, "SUBMISSIONS_UNAVAILABLE");
}

/** Tarefa publicada de uma disciplina do âmbito da sessão. */
async function loadTask(db: Db, scope: MobileAcademicScope, taskId: string) {
  const found = await db
    .from("siga_class_tasks")
    .select("id, class_subject_id, due_on")
    .eq("school_id", scope.schoolId)
    .eq("id", taskId)
    .eq("status", "published")
    .maybeSingle();
  if (found.error) throw new MobileApiError(503, "SUBMISSIONS_UNAVAILABLE");
  const task = found.data as TaskRow | null;
  if (!task) throw new MobileApiError(404, "TASK_NOT_FOUND");
  if (!scope.classSubjectIds.includes(task.class_subject_id))
    throw new MobileApiError(403, "TASK_FORBIDDEN");
  return task;
}

/** Entregar e reenviar só até ao fim do dia do prazo (hora da escola). */
function assertOpen(task: TaskRow) {
  if (task.due_on && schoolTodayIso() > task.due_on)
    throw new MobileApiError(409, "SUBMISSION_CLOSED");
}

function requireStudent(scope: MobileAcademicScope) {
  if (scope.role !== "aluno" || !scope.studentId) throw new MobileApiError(403, "ROLE_FORBIDDEN");
  return scope.studentId;
}

/** Nome seguro para o caminho, como no Arquivo do portal. */
export function safeFileName(name: string) {
  const base = name.replace(/[^\w.-]+/g, "_").slice(0, 80);
  return /\.pdf$/i.test(base) ? base : `${base}.pdf`;
}

/** O caminho só pode ser da escola e do utilizador da sessão. */
export function isOwnSubmissionPath(path: string, schoolId: string, userId: string) {
  const parts = path.split("/");
  return (
    parts.length === 6 &&
    parts[0] === schoolId &&
    /^\d{4}$/.test(parts[1]) &&
    /^\d{2}$/.test(parts[2]) &&
    parts[3] === "submissions" &&
    parts[4] === userId &&
    /^[0-9a-f-]{36}-[\w.-]{1,80}$/i.test(parts[5]) &&
    /\.pdf$/i.test(parts[5])
  );
}

function project(row: SubmissionRow, names?: Map<string, string>) {
  return {
    id: row.id,
    taskId: row.task_id,
    studentId: row.student_id,
    ...(names ? { studentName: names.get(row.student_id) ?? null } : {}),
    fileName: row.file_name,
    sizeBytes: row.size_bytes,
    version: row.version,
    status: row.status,
    submittedAt: row.submitted_at,
  };
}

export async function prepareMobileSubmissionUpload(
  db: Db,
  scope: MobileAcademicScope,
  userId: string,
  input: { taskId: string; fileName: string; sizeBytes: number },
) {
  requireStudent(scope);
  if (!/\.pdf$/i.test(input.fileName.trim())) throw new MobileApiError(422, "PDF_REQUIRED");
  if (input.sizeBytes > SUBMISSION_MAX_BYTES) throw new MobileApiError(413, "FILE_TOO_LARGE");
  await assertReady(db);
  assertOpen(await loadTask(db, scope, input.taskId));
  const today = schoolTodayIso();
  const path = [
    scope.schoolId,
    today.slice(0, 4),
    today.slice(5, 7),
    "submissions",
    userId,
    `${randomUUID()}-${safeFileName(input.fileName.trim())}`,
  ].join("/");
  const signed = await db.storage.from(SUBMISSION_BUCKET).createSignedUploadUrl(path);
  if (signed.error || !signed.data) throw new MobileApiError(503, "SUBMISSION_STORAGE_UNAVAILABLE");
  return {
    schoolId: scope.schoolId,
    userId,
    role: scope.role,
    taskId: input.taskId,
    path,
    uploadUrl: signed.data.signedUrl,
    maxBytes: SUBMISSION_MAX_BYTES,
  };
}

export async function registerMobileSubmission(
  db: Db,
  scope: MobileAcademicScope,
  userId: string,
  input: { taskId: string; path: string },
) {
  const studentId = requireStudent(scope);
  if (!isOwnSubmissionPath(input.path, scope.schoolId, userId))
    throw new MobileApiError(403, "SUBMISSION_PATH_FORBIDDEN");
  await assertReady(db);
  assertOpen(await loadTask(db, scope, input.taskId));

  // Um ficheiro registado não pode ser reutilizado noutra tarefa ou aluno.
  // Verificar ANTES do download e, sobretudo, de qualquer limpeza no Storage:
  // o mesmo pedido repetido deve devolver a entrega já guardada sem a apagar.
  const linked = await submissionsTable(db)
    .select(SUBMISSION_FIELDS)
    .eq("school_id", scope.schoolId)
    .eq("storage_path", input.path)
    .maybeSingle();
  if (linked.error) throw new MobileApiError(503, "SUBMISSIONS_UNAVAILABLE");
  if (linked.data) {
    const current = linked.data as SubmissionRow;
    if (current.task_id !== input.taskId || current.student_id !== studentId) {
      throw new MobileApiError(409, "SUBMISSION_PATH_IN_USE");
    }
    return {
      schoolId: scope.schoolId,
      userId,
      role: scope.role,
      submission: project(current),
    };
  }

  const storage = db.storage.from(SUBMISSION_BUCKET);
  const file = await storage.download(input.path);
  if (file.error || !file.data) throw new MobileApiError(404, "SUBMISSION_FILE_NOT_FOUND");
  // O download já devolveu um Blob. O seu tamanho é fiável para o limite
  // e basta ler os primeiros cinco bytes, sem copiar até 10 MB para outro buffer.
  const sizeBytes = file.data.size;
  const tooLarge = sizeBytes > SUBMISSION_MAX_BYTES;
  const isPdf =
    !tooLarge &&
    sizeBytes >= 5 &&
    new TextDecoder("latin1").decode(new Uint8Array(await file.data.slice(0, 5).arrayBuffer())) ===
      "%PDF-";
  if (tooLarge || !isPdf) {
    // O erro de limpeza não pode esconder a razão da rejeição (413/422).
    try {
      await storage.remove([input.path]);
    } catch {
      // Ficheiro inválido fica para limpeza controlada posterior.
    }
    throw new MobileApiError(tooLarge ? 413 : 422, tooLarge ? "FILE_TOO_LARGE" : "PDF_REQUIRED");
  }
  const fileName = input.path.split("/")[5].slice(37);

  const existing = await submissionsTable(db)
    .select(SUBMISSION_FIELDS)
    .eq("school_id", scope.schoolId)
    .eq("task_id", input.taskId)
    .eq("student_id", studentId)
    .maybeSingle();
  if (existing.error) throw new MobileApiError(503, "SUBMISSIONS_UNAVAILABLE");
  const previous = existing.data as SubmissionRow | null;
  const values = {
    storage_path: input.path,
    file_name: fileName,
    size_bytes: sizeBytes,
    status: "submitted",
    submitted_by: userId,
    submitted_at: new Date().toISOString(),
  };
  const saved = previous
    ? await submissionsTable(db)
        .update({ ...values, version: previous.version + 1 })
        .eq("school_id", scope.schoolId)
        .eq("id", previous.id)
        .eq("student_id", studentId)
        // Optimistic lock: outro reenvio não pode sobrescrever esta versão.
        .eq("version", previous.version)
        .select(SUBMISSION_FIELDS)
        .maybeSingle()
    : await submissionsTable(db)
        .insert({
          ...values,
          school_id: scope.schoolId,
          task_id: input.taskId,
          student_id: studentId,
        })
        .select(SUBMISSION_FIELDS)
        .single();
  // A primeira entrega também pode perder a corrida para um INSERT concorrente.
  // Neste caso não apagar o PDF vencedor nem avançar a versão.
  if (saved.error?.code === "23505" || (!saved.error && !saved.data)) {
    throw new MobileApiError(409, "SUBMISSION_CONFLICT");
  }
  if (saved.error) throw new MobileApiError(503, "SUBMISSION_WRITE_FAILED");
  // O ficheiro anterior deixa de estar ligado a nada; apagar é melhor esforço.
  if (previous && previous.storage_path !== input.path) {
    // Limpeza de melhor esforço. A entrega já está guardada: uma falha no
    // Storage não pode fazer o cliente acreditar que o reenvio falhou.
    try {
      await storage.remove([previous.storage_path]);
    } catch {
      // O ficheiro antigo fica órfão para limpeza controlada posterior.
    }
  }
  return {
    schoolId: scope.schoolId,
    userId,
    role: scope.role,
    submission: project(saved.data as SubmissionRow),
  };
}

/** Aluno: as suas entregas. Professor: as entregas de uma tarefa sua. */
export async function readMobileSubmissions(
  db: Db,
  scope: MobileAcademicScope,
  userId: string,
  taskId?: string,
) {
  await assertReady(db);
  let rows: SubmissionRow[];
  let names: Map<string, string> | undefined;
  if (scope.role === "aluno") {
    const studentId = requireStudent(scope);
    let query = submissionsTable(db)
      .select(SUBMISSION_FIELDS)
      .eq("school_id", scope.schoolId)
      .eq("student_id", studentId);
    if (taskId) query = query.eq("task_id", taskId);
    const found = await query.limit(1000);
    if (found.error || !found.data) throw new MobileApiError(503, "SUBMISSIONS_UNAVAILABLE");
    rows = found.data as SubmissionRow[];
  } else {
    if (!taskId) throw new MobileApiError(422, "TASK_REQUIRED");
    await loadTask(db, scope, taskId);
    const found = await submissionsTable(db)
      .select(SUBMISSION_FIELDS)
      .eq("school_id", scope.schoolId)
      .eq("task_id", taskId)
      .limit(1000);
    if (found.error || !found.data) throw new MobileApiError(503, "SUBMISSIONS_UNAVAILABLE");
    rows = found.data as SubmissionRow[];
    names = await studentNames(
      db,
      scope.schoolId,
      rows.map((r) => r.student_id),
    );
  }
  rows.sort((a, b) => b.submitted_at.localeCompare(a.submitted_at));
  return {
    schoolId: scope.schoolId,
    userId,
    role: scope.role,
    ...(taskId ? { taskId } : {}),
    submissions: rows.map((r) => project(r, names)),
  };
}

async function studentNames(db: Db, schoolId: string, studentIds: string[]) {
  const names = new Map<string, string>();
  if (!studentIds.length) return names;
  const students = await db
    .from("students")
    .select("id, person_id")
    .eq("school_id", schoolId)
    .in("id", [...new Set(studentIds)]);
  if (students.error || !students.data) throw new MobileApiError(503, "SUBMISSIONS_UNAVAILABLE");
  const byPerson = new Map(
    (students.data as { id: string; person_id: string }[]).map((s) => [s.person_id, s.id]),
  );
  if (!byPerson.size) return names;
  const people = await db
    .from("people")
    .select("id, full_name")
    .eq("school_id", schoolId)
    .in("id", [...byPerson.keys()]);
  if (people.error || !people.data) throw new MobileApiError(503, "SUBMISSIONS_UNAVAILABLE");
  for (const p of people.data as { id: string; full_name: string }[]) {
    const student = byPerson.get(p.id);
    if (student) names.set(student, p.full_name);
  }
  return names;
}

/** URL de leitura de 10 minutos: o próprio aluno ou o professor da tarefa. */
export async function signMobileSubmissionFile(
  db: Db,
  scope: MobileAcademicScope,
  submissionId: string,
) {
  await assertReady(db);
  const found = await submissionsTable(db)
    .select(SUBMISSION_FIELDS)
    .eq("school_id", scope.schoolId)
    .eq("id", submissionId)
    .maybeSingle();
  if (found.error) throw new MobileApiError(503, "SUBMISSIONS_UNAVAILABLE");
  const row = found.data as SubmissionRow | null;
  if (!row) throw new MobileApiError(404, "SUBMISSION_NOT_FOUND");
  if (scope.role === "aluno") {
    if (row.student_id !== requireStudent(scope))
      throw new MobileApiError(403, "SUBMISSION_FORBIDDEN");
  } else {
    await loadTask(db, scope, row.task_id);
  }
  const signed = await db.storage
    .from(SUBMISSION_BUCKET)
    .createSignedUrl(row.storage_path, SIGNED_SECONDS);
  if (signed.error || !signed.data) throw new MobileApiError(503, "SUBMISSION_STORAGE_UNAVAILABLE");
  return { url: signed.data.signedUrl };
}
