/**
 * Entregas de trabalhos (SPEC SGA_TRABALHOS_MATRICULAS_2026-10-25, §2).
 *
 * Uma linha por tentativa em siga_class_task_submissions: reenviar cria a seguinte,
 * nada se apaga. O aluno pode reenviar até o professor devolver; a nota e o
 * comentário só lhe aparecem depois de devolvidos.
 */

export type SubmissionRow = {
  id: string;
  enrollment_id: string;
  attempt: number;
  status: "draft" | "submitted" | "returned";
  submitted_at: string | null;
  is_late: boolean;
  on_paper: boolean;
  body: string | null;
  grade: number | null;
  feedback: string | null;
  returned_at: string | null;
};

/** Dia em Luanda (UTC+1, sem hora de Verão) de um instante ISO. */
export function luandaDay(iso: string): string {
  return new Date(new Date(iso).getTime() + 60 * 60_000).toISOString().slice(0, 10);
}

/** O prazo é o dia inteiro em Luanda: entregar no próprio dia ainda não é atraso. */
export function isLate(dueOn: string | null, submittedAt: string): boolean {
  return Boolean(dueOn) && luandaDay(submittedAt) > dueOn!;
}

/** A tentativa mais recente de cada matrícula. */
export function latestByEnrollment(rows: readonly SubmissionRow[]): Map<string, SubmissionRow> {
  const latest = new Map<string, SubmissionRow>();
  for (const row of rows) {
    const current = latest.get(row.enrollment_id);
    if (!current || row.attempt > current.attempt) latest.set(row.enrollment_id, row);
  }
  return latest;
}

export type SubmitDecision =
  { ok: true; attempt: number; late: boolean } | { ok: false; reason: string };

/** Pode entregar agora? E com que número de tentativa. */
export function decideSubmission(input: {
  taskStatus: string;
  dueOn: string | null;
  acceptsLate: boolean;
  latest: SubmissionRow | null;
  now: string;
}): SubmitDecision {
  if (input.taskStatus !== "published") {
    return { ok: false, reason: "Esta tarefa já não aceita entregas." };
  }
  if (input.latest?.status === "returned") {
    return { ok: false, reason: "O professor já devolveu esta entrega." };
  }
  const late = isLate(input.dueOn, input.now);
  if (late && !input.acceptsLate) {
    return { ok: false, reason: "O prazo terminou e esta tarefa não aceita entregas atrasadas." };
  }
  const attempt = (input.latest?.attempt ?? 0) + 1;
  if (attempt > 20) return { ok: false, reason: "Atingiu o número máximo de reenvios." };
  return { ok: true, attempt, late };
}

/** O que o aluno (ou o encarregado) vê da sua entrega: a nota só depois de devolvida. */
export function studentView(row: SubmissionRow | null) {
  if (!row) return null;
  const returned = row.status === "returned";
  return {
    attempt: row.attempt,
    status: row.status,
    submittedAt: row.submitted_at,
    isLate: row.is_late,
    onPaper: row.on_paper,
    body: row.body,
    grade: returned ? row.grade : null,
    feedback: returned ? row.feedback : null,
    returnedAt: returned ? row.returned_at : null,
  };
}

/**
 * Estado de um trabalho do ponto de vista do aluno:
 * - `returned`: o professor devolveu (com ou sem nota);
 * - `submitted`: entregue, à espera de devolução;
 * - `overdue`: por entregar e o prazo passou (ainda aceita, se a tarefa deixar);
 * - `open`: por entregar, dentro do prazo ou sem prazo;
 * - `missed`: por entregar e já não aceita (arquivada, ou prazo sem atrasos).
 */
export type TaskState = "returned" | "submitted" | "overdue" | "open" | "missed";

export function taskState(input: {
  taskStatus: string;
  dueOn: string | null;
  acceptsLate: boolean;
  latest: Pick<SubmissionRow, "status"> | null;
  today: string;
}): TaskState {
  if (input.latest?.status === "returned") return "returned";
  if (input.latest?.status === "submitted") return "submitted";
  const pastDue = Boolean(input.dueOn) && input.today > input.dueOn!;
  if (input.taskStatus !== "published") return "missed";
  if (pastDue) return input.acceptsLate ? "overdue" : "missed";
  return "open";
}

export type WorkSummary = {
  total: number;
  delivered: number;
  returned: number;
  late: number;
  /** Média das notas devolvidas (0–20), arredondada a uma casa. */
  average: number | null;
};

/** Resumo de um conjunto de entregas (a última tentativa de cada trabalho ou aluno). */
export function summarizeWork(
  total: number,
  latest: ReadonlyArray<Pick<SubmissionRow, "status" | "is_late" | "grade"> | null>,
): WorkSummary {
  const delivered = latest.filter(Boolean) as Array<
    Pick<SubmissionRow, "status" | "is_late" | "grade">
  >;
  const grades = delivered
    .filter((row) => row.status === "returned" && row.grade != null)
    .map((row) => Number(row.grade));
  return {
    total,
    delivered: delivered.length,
    returned: delivered.filter((row) => row.status === "returned").length,
    late: delivered.filter((row) => row.is_late).length,
    average: grades.length
      ? Math.round((grades.reduce((sum, grade) => sum + grade, 0) / grades.length) * 10) / 10
      : null,
  };
}
