/**
 * Trabalhos da turma (SIGA Context Engine): as tarefas que os professores criam
 * no detalhe de cada aula, juntas numa lista da turma ou da disciplina.
 * Só a montagem da lista; quem lê o quê decide o servidor (`listClassTasks`).
 */

export type ClassTaskRow = {
  id: string;
  class_subject_id: string;
  kind: string;
  title: string;
  description: string | null;
  due_on: string | null;
  created_at: string | null;
};

export type ClassTaskItem = {
  id: string;
  kind: string;
  title: string;
  description: string | null;
  dueOn: string | null;
  subjectId: string;
  subjectName: string;
};

export type ClassTaskList = {
  /** A tabela das tarefas ainda não existe nesta base. */
  available: boolean;
  /** Com prazo hoje ou depois, ou sem prazo: do prazo mais próximo para o mais longe. */
  open: ClassTaskItem[];
  /** Prazo já passado: do mais recente para o mais antigo. */
  closed: ClassTaskItem[];
};

export const EMPTY_CLASS_TASKS: ClassTaskList = { available: true, open: [], closed: [] };

/**
 * Junta cada tarefa à sua disciplina e separa as abertas das de prazo terminado.
 * Uma tarefa cuja disciplina não está na lista (de outra turma, ou de uma
 * disciplina que a conta não lecciona) não entra.
 */
export function buildClassTaskList(
  rows: ClassTaskRow[],
  offerings: ReadonlyMap<string, { subjectId: string; subjectName: string }>,
  today: string,
): ClassTaskList {
  const items: ClassTaskItem[] = [];
  for (const row of rows) {
    const offering = offerings.get(row.class_subject_id);
    if (!offering) continue;
    items.push({
      id: row.id,
      kind: row.kind,
      title: row.title,
      description: row.description,
      dueOn: row.due_on,
      subjectId: offering.subjectId,
      subjectName: offering.subjectName,
    });
  }
  const open = items.filter((item) => !item.dueOn || item.dueOn >= today);
  const closed = items.filter((item) => item.dueOn && item.dueOn < today);
  // Sem prazo vai para o fim das abertas; empate pelo título.
  open.sort(
    (a, b) =>
      (a.dueOn ?? "9999-12-31").localeCompare(b.dueOn ?? "9999-12-31") ||
      a.title.localeCompare(b.title, "pt"),
  );
  closed.sort(
    (a, b) => (b.dueOn ?? "").localeCompare(a.dueOn ?? "") || a.title.localeCompare(b.title, "pt"),
  );
  return { available: true, open, closed };
}
