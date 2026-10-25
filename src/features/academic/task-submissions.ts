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
