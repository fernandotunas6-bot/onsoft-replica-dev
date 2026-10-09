import type { Gateway, Session, Workspace, Context, Command, Role } from "../domain/model";
import { authorize, scopeWorkspace, validateCommand } from "../domain/policy";
export function demoSession(role: Role): Session {
  return {
    userId: role === "professor" ? "demo-teacher" : "demo-student",
    name: role === "professor" ? "Professor de demonstração" : "Aluno de demonstração",
    mode: "demo",
    memberships: ["a", "b"].map((id) => ({
      schoolId: "demo-" + id,
      schoolName: "Escola de teste " + id.toUpperCase(),
      roles: [role],
      active: true,
      permissions:
        role === "professor"
          ? ["academic.read", "attendance.write", "grades.write", "tasks.write", "messages.write"]
          : ["academic.read", "submissions.write", "messages.write", "documents.request"],
    })),
  };
}
export function seed(schoolId: string): Workspace {
  const today = new Date().toISOString().slice(0, 10);
  const due = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  return {
    schoolId,
    classes: [
      {
        id: schoolId + "-class",
        name: "10.ª A",
        subject: "Matemática",
        teacherUserId: "demo-teacher",
        students: [
          {
            id: schoolId + "-s1",
            name: "Aluno de teste 01",
            userId: "demo-student",
          },
          {
            id: schoolId + "-s2",
            name: "Aluno de teste 02",
            userId: "demo-other",
          },
        ],
      },
    ],
    lessons: [
      {
        id: schoolId + "-lesson",
        classId: schoolId + "-class",
        date: today,
        time: "08:00–08:45",
        room: "Sala 04",
        topic: "Equações e resolução de problemas",
      },
    ],
    grades: [
      {
        classId: schoolId + "-class",
        studentId: schoolId + "-s1",
        value: 15,
        published: true,
        periodOpen: true,
        revision: 1,
      },
    ],
    attendance: [],
    tasks: [
      {
        id: schoolId + "-task",
        classId: schoolId + "-class",
        title: "Exercícios de equações",
        instructions: "Resolve duas equações e explica o teu raciocínio.",
        due,
        published: true,
      },
    ],
    submissions: [],
    plans: [],
    messages: [],
    announcements: ["Ambiente de teste: todos os registos são fictícios."],
    documents: [],
  };
}
export class DemoGateway implements Gateway {
  private current: Session | null;
  private db = new Map<string, Workspace>();
  constructor(role: Role) {
    this.current = demoSession(role);
  }
  setRole(role: Role) {
    this.current = demoSession(role);
  }
  async session() {
    return this.current;
  }
  async workspace(ctx: Context) {
    authorize(this.current, ctx);
    return structuredClone(scopeWorkspace(this.data(ctx.schoolId), ctx));
  }
  private data(id: string) {
    if (!this.db.has(id)) this.db.set(id, seed(id));
    return this.db.get(id)!;
  }
  async execute(ctx: Context, cmd: Command) {
    if (!this.current) throw new Error("Sessão terminada.");
    const data = this.data(ctx.schoolId);
    validateCommand(this.current, ctx, data, cmd);
    const student = data.classes.flatMap((g) => g.students).find((s) => s.userId === ctx.userId);
    const now = new Date().toISOString();
    if (cmd.type === "attendance")
      for (const e of cmd.entries) {
        data.attendance = data.attendance.filter(
          (a) => !(a.lessonId === cmd.lessonId && a.studentId === e.studentId),
        );
        data.attendance.push({ lessonId: cmd.lessonId, ...e });
      }
    if (cmd.type === "grade") {
      data.grades = data.grades.filter(
        (g) => !(g.classId === cmd.classId && g.studentId === cmd.studentId),
      );
      data.grades.push({
        classId: cmd.classId,
        studentId: cmd.studentId,
        value: cmd.value,
        published: cmd.published,
        periodOpen: true,
        revision: cmd.expectedRevision + 1,
      });
    }
    if (cmd.type === "plan") {
      data.plans = data.plans.filter((p) => p.lessonId !== cmd.lessonId);
      data.plans.push({
        lessonId: cmd.lessonId,
        objectives: cmd.objectives.trim(),
        materials: cmd.materials.trim(),
      });
    }
    if (cmd.type === "task")
      data.tasks.push({
        id: crypto.randomUUID(),
        classId: cmd.classId,
        title: cmd.title.trim(),
        instructions: cmd.instructions.trim(),
        due: cmd.due,
        published: true,
      });
    if (cmd.type === "submission") {
      if (!student) throw new Error("Matrícula não encontrada.");
      data.submissions = data.submissions.filter(
        (s) => !(s.taskId === cmd.taskId && s.studentId === student.id),
      );
      data.submissions.push({
        taskId: cmd.taskId,
        studentId: student.id,
        text: cmd.text.trim(),
        submittedAt: now,
      });
    }
    if (cmd.type === "message")
      data.messages.push({
        id: crypto.randomUUID(),
        from: ctx.userId,
        to: cmd.to,
        text: cmd.text.trim(),
        sentAt: now,
      });
    if (cmd.type === "document") {
      if (!student) throw new Error("Matrícula não encontrada.");
      data.documents.push({
        id: crypto.randomUUID(),
        studentId: student.id,
        type: cmd.documentType,
        status: "solicitado",
      });
    }
  }
  async signOut() {
    this.current = null;
    this.db.clear();
  }
}
