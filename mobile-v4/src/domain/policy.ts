import type { Context, Session, Permission, Workspace, Command, ClassGroup } from "./model";
export const required: Record<Command["type"], Permission> = {
  attendance: "attendance.write",
  grade: "grades.write",
  plan: "tasks.write",
  task: "tasks.write",
  submission: "submissions.write",
  message: "messages.write",
  document: "documents.request",
};
export function authorize(
  session: Session | null,
  ctx: Context,
  permission: Permission = "academic.read",
) {
  const m = session?.memberships.find((m) => m.schoolId === ctx.schoolId && m.active);
  if (
    !session ||
    session.userId !== ctx.userId ||
    !m ||
    !m.roles.includes(ctx.role) ||
    !m.permissions.includes(permission)
  )
    throw new Error("Sem permissão para esta escola ou operação.");
  return m;
}
export function parseGrade(input: string): number {
  if (!input.trim()) throw new Error("Introduz uma nota de 0 a 20.");
  const value = Number(input.replace(",", "."));
  if (!Number.isFinite(value) || value < 0 || value > 20)
    throw new Error("A nota deve estar entre 0 e 20.");
  return value;
}
export function classAllowed(group: ClassGroup, ctx: Context) {
  return ctx.role === "professor"
    ? group.teacherUserId === ctx.userId
    : group.students.some((s) => s.userId === ctx.userId);
}
export function scopeWorkspace(data: Workspace, ctx: Context): Workspace {
  if (data.schoolId !== ctx.schoolId) throw new Error("Resposta pertence a outra escola.");
  const groups = data.classes.filter((g) => classAllowed(g, ctx));
  const ids = new Set(groups.map((g) => g.id));
  const studentIds = new Set(
    groups.flatMap((g) =>
      g.students
        .filter((s) => ctx.role === "professor" || s.userId === ctx.userId)
        .map((s) => s.id),
    ),
  );
  const lessons = data.lessons.filter((l) => ids.has(l.classId));
  const lessonIds = new Set(lessons.map((l) => l.id));
  const tasks = data.tasks.filter(
    (t) => ids.has(t.classId) && (ctx.role === "professor" || t.published),
  );
  const taskIds = new Set(tasks.map((t) => t.id));
  return {
    ...data,
    classes: groups.map((g) =>
      ctx.role === "aluno"
        ? { ...g, students: g.students.filter((s) => s.userId === ctx.userId) }
        : g,
    ),
    lessons,
    tasks,
    grades: data.grades.filter(
      (g) =>
        ids.has(g.classId) &&
        studentIds.has(g.studentId) &&
        (ctx.role === "professor" || g.published),
    ),
    attendance: data.attendance.filter(
      (a) => lessonIds.has(a.lessonId) && studentIds.has(a.studentId),
    ),
    teacherAttendance:
      ctx.role === "professor"
        ? (data.teacherAttendance || []).filter(
            (a) => a.userId === ctx.userId && lessonIds.has(a.lessonId),
          )
        : [],
    submissions: data.submissions.filter(
      (s) => taskIds.has(s.taskId) && studentIds.has(s.studentId),
    ),
    plans: ctx.role === "professor" ? data.plans.filter((p) => lessonIds.has(p.lessonId)) : [],
    messages: data.messages.filter((m) => m.from === ctx.userId || m.to === ctx.userId),
    documents: data.documents.filter((d) => studentIds.has(d.studentId)),
  };
}
export function validateCommand(
  session: Session,
  ctx: Context,
  data: Workspace,
  cmd: Command,
  now = new Date(),
) {
  authorize(session, ctx, required[cmd.type]);
  if (data.schoolId !== ctx.schoolId) throw new Error("Escola inválida.");
  const teacher = () => {
    if (ctx.role !== "professor") throw new Error("Operação exclusiva do professor.");
  };
  const group = (id: string) => {
    const g = data.classes.find((g) => g.id === id);
    if (!g || !classAllowed(g, ctx)) throw new Error("Turma não autorizada.");
    return g;
  };
  const lesson = (id: string) => {
    const l = data.lessons.find((l) => l.id === id);
    if (!l) throw new Error("Aula inexistente.");
    return group(l.classId);
  };
  const text = (s: string, max = 4000) => {
    if (!s.trim() || s.length > max) throw new Error("Texto vazio ou demasiado longo.");
  };
  if (cmd.type === "attendance") {
    teacher();
    const g = lesson(cmd.lessonId);
    if (
      !cmd.entries.length ||
      new Set(cmd.entries.map((e) => e.studentId)).size !== cmd.entries.length
    )
      throw new Error("Chamada inválida.");
    for (const e of cmd.entries)
      if (
        !g.students.some((s) => s.id === e.studentId) ||
        !["presente", "ausente", "justificada"].includes(e.status)
      )
        throw new Error("Aluno ou presença inválidos.");
  }
  if (cmd.type === "grade") {
    teacher();
    const g = group(cmd.classId);
    if (!g.students.some((s) => s.id === cmd.studentId)) throw new Error("Aluno fora da turma.");
    parseGrade(String(cmd.value));
    const old = data.grades.find((g) => g.classId === cmd.classId && g.studentId === cmd.studentId);
    if (old && !old.periodOpen) throw new Error("Período encerrado.");
    if ((old?.revision || 0) !== cmd.expectedRevision)
      throw new Error("Nota alterada entretanto. Recarrega antes de guardar.");
  }
  if (cmd.type === "plan") {
    teacher();
    lesson(cmd.lessonId);
    text(cmd.objectives);
    if (cmd.materials.length > 4000) throw new Error("Materiais demasiado longos.");
  }
  if (cmd.type === "task") {
    teacher();
    group(cmd.classId);
    text(cmd.title, 160);
    text(cmd.instructions);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(cmd.due) ||
      Number.isNaN(Date.parse(cmd.due)) ||
      cmd.due < now.toISOString().slice(0, 10)
    )
      throw new Error("Prazo inválido ou passado.");
  }
  if (cmd.type === "submission") {
    if (ctx.role !== "aluno") throw new Error("Operação exclusiva do aluno.");
    const t = data.tasks.find((t) => t.id === cmd.taskId && t.published);
    if (!t) throw new Error("Trabalho indisponível.");
    group(t.classId);
    text(cmd.text);
    if (t.due < now.toISOString().slice(0, 10)) throw new Error("Prazo de entrega encerrado.");
  }
  if (cmd.type === "message") {
    text(cmd.text, 2000);
    const contacts = data.classes
      .filter((g) => classAllowed(g, ctx))
      .flatMap((g) =>
        ctx.role === "professor" ? g.students.map((s) => s.userId) : [g.teacherUserId],
      );
    if (!contacts.includes(cmd.to)) throw new Error("Destinatário fora do vínculo académico.");
  }
  if (cmd.type === "document") {
    if (ctx.role !== "aluno") throw new Error("Operação exclusiva do aluno.");
    if (!["Declaração de frequência", "Boletim", "Histórico escolar"].includes(cmd.documentType))
      throw new Error("Documento inválido.");
  }
}
