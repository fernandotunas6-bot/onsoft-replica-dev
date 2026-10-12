import { describe, it, expect } from "vitest";
import { DemoGateway, demoSession, seed } from "../src/services/demo";
import { authorize, parseGrade, scopeWorkspace, validateCommand } from "../src/domain/policy";
import type { Context } from "../src/domain/model";
const teacher: Context = {
  userId: "demo-teacher",
  schoolId: "demo-a",
  role: "professor",
};
const student: Context = {
  userId: "demo-student",
  schoolId: "demo-a",
  role: "aluno",
};
describe("tenant and permissions", () => {
  it("rejects missing membership", () =>
    expect(() => authorize(demoSession("professor"), { ...teacher, schoolId: "other" })).toThrow());
  it("rejects forged user and role", () => {
    expect(() => authorize(demoSession("aluno"), teacher)).toThrow();
    expect(() => authorize(demoSession("professor"), { ...teacher, role: "aluno" })).toThrow();
  });
  it("rejects inactive membership and revoked grant", () => {
    const s = demoSession("professor");
    s.memberships[0].active = false;
    expect(() => authorize(s, teacher)).toThrow();
    s.memberships[0].active = true;
    s.memberships[0].permissions = ["academic.read"];
    expect(() => authorize(s, teacher, "grades.write")).toThrow();
  });
  it("rejects another school response", () =>
    expect(() => scopeWorkspace(seed("demo-b"), teacher)).toThrow());
  it("student receives only own published grades, own attendance and no roster", () => {
    const d = seed("demo-a");
    d.grades.push({ ...d.grades[0], studentId: "demo-a-s2", value: 19 });
    d.grades[0].published = false;
    const own = scopeWorkspace(d, student);
    expect(own.grades).toHaveLength(0);
    expect(own.classes[0].students).toHaveLength(1);
    expect(own.plans).toHaveLength(0);
  });
  it("rejects foreign class mutations", () =>
    expect(() =>
      validateCommand(demoSession("professor"), teacher, seed("demo-a"), {
        type: "task",
        classId: "demo-b-class",
        title: "x",
        instructions: "y",
        due: "2099-01-01",
      }),
    ).toThrow());
  it("rejects teacher assignment outside scope", () => {
    const d = seed("demo-a");
    d.classes[0].teacherUserId = "someone-else";
    expect(scopeWorkspace(d, teacher).classes).toHaveLength(0);
    expect(() =>
      validateCommand(demoSession("professor"), teacher, d, {
        type: "plan",
        lessonId: "demo-a-lesson",
        objectives: "x",
        materials: "",
      }),
    ).toThrow();
  });
  it("rejects student grade writes", async () => {
    const g = new DemoGateway("aluno");
    await expect(
      g.execute(student, {
        type: "grade",
        classId: "demo-a-class",
        studentId: "demo-a-s1",
        value: 19,
        published: true,
        expectedRevision: 1,
      }),
    ).rejects.toThrow();
  });
  it("does not leak records between schools", async () => {
    const g = new DemoGateway("professor");
    await g.execute(teacher, {
      type: "attendance",
      lessonId: "demo-a-lesson",
      entries: [{ studentId: "demo-a-s1", status: "ausente" }],
    });
    expect((await g.workspace({ ...teacher, schoolId: "demo-b" })).attendance).toHaveLength(0);
  });
  it("rejects closed period and stale revision", () => {
    const d = seed("demo-a");
    const cmd = {
      type: "grade" as const,
      classId: "demo-a-class",
      studentId: "demo-a-s1",
      value: 19,
      published: true,
      expectedRevision: 0,
    };
    expect(() => validateCommand(demoSession("professor"), teacher, d, cmd)).toThrow("entretanto");
    d.grades[0].periodOpen = false;
    expect(() =>
      validateCommand(demoSession("professor"), teacher, d, {
        ...cmd,
        expectedRevision: 1,
      }),
    ).toThrow("encerrado");
  });
});
describe("academic flows", () => {
  it.each(["", " ", "-1", "21", "NaN", "Infinity", "abc"])("rejects invalid grade %s", (x) =>
    expect(() => parseGrade(x)).toThrow(),
  );
  it.each([
    ["0", 0],
    ["20", 20],
    ["15,5", 15.5],
  ])("accepts valid grade %s", (x, y) => expect(parseGrade(String(x))).toBe(y));
  it("records attendance and rejects another student", async () => {
    const g = new DemoGateway("professor");
    await g.execute(teacher, {
      type: "attendance",
      lessonId: "demo-a-lesson",
      entries: [{ studentId: "demo-a-s1", status: "justificada" }],
    });
    expect((await g.workspace(teacher)).attendance[0].status).toBe("justificada");
    await expect(
      g.execute(teacher, {
        type: "attendance",
        lessonId: "demo-a-lesson",
        entries: [{ studentId: "demo-b-s1", status: "presente" }],
      }),
    ).rejects.toThrow();
  });
  it("teacher saves published grade then student reads it", async () => {
    const g = new DemoGateway("professor");
    await g.execute(teacher, {
      type: "grade",
      classId: "demo-a-class",
      studentId: "demo-a-s1",
      value: 17.5,
      published: true,
      expectedRevision: 1,
    });
    g.setRole("aluno");
    expect((await g.workspace(student)).grades[0].value).toBe(17.5);
  });
  it("teacher publishes task, student submits and teacher reviews", async () => {
    const g = new DemoGateway("professor");
    await g.execute(teacher, {
      type: "task",
      classId: "demo-a-class",
      title: "Equações",
      instructions: "Resolve",
      due: "2099-01-01",
    });
    const t = (await g.workspace(teacher)).tasks.at(-1)!;
    g.setRole("aluno");
    await g.execute(student, {
      type: "submission",
      taskId: t.id,
      text: "x = 2",
    });
    g.setRole("professor");
    expect((await g.workspace(teacher)).submissions[0].text).toBe("x = 2");
  });
  it("rejects late submissions and invalid deadlines", () => {
    const d = seed("demo-a");
    d.tasks[0].due = "2000-01-01";
    expect(() =>
      validateCommand(demoSession("aluno"), student, d, {
        type: "submission",
        taskId: d.tasks[0].id,
        text: "x",
      }),
    ).toThrow("encerrado");
    expect(() =>
      validateCommand(demoSession("professor"), teacher, d, {
        type: "task",
        classId: "demo-a-class",
        title: "x",
        instructions: "x",
        due: "invalid",
      }),
    ).toThrow();
  });
  it("saves a plan and does not disclose it to students", async () => {
    const g = new DemoGateway("professor");
    await g.execute(teacher, {
      type: "plan",
      lessonId: "demo-a-lesson",
      objectives: "Resolver equações",
      materials: "Livro",
    });
    expect((await g.workspace(teacher)).plans).toHaveLength(1);
    g.setRole("aluno");
    expect((await g.workspace(student)).plans).toHaveLength(0);
  });
  it("routes messages only to academic contacts", async () => {
    const g = new DemoGateway("aluno");
    await expect(
      g.execute(student, { type: "message", to: "outsider", text: "Olá" }),
    ).rejects.toThrow();
    await g.execute(student, {
      type: "message",
      to: "demo-teacher",
      text: "Dúvida",
    });
    g.setRole("professor");
    expect((await g.workspace(teacher)).messages[0].text).toBe("Dúvida");
  });
  it("student requests document and logout clears session", async () => {
    const g = new DemoGateway("aluno");
    await g.execute(student, { type: "document", documentType: "Boletim" });
    expect((await g.workspace(student)).documents[0].status).toBe("solicitado");
    await g.signOut();
    await expect(g.workspace(student)).rejects.toThrow();
  });
});
