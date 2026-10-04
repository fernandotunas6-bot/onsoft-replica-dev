import { describe, expect, it, vi } from "vitest";

type Rows = Record<string, Array<Record<string, unknown>>>;

/** Base mínima: aplica os filtros eq/in de cada consulta às linhas dadas. */
function fakeDb(rows: Rows) {
  return {
    from(table: string) {
      const filters: Array<(row: Record<string, unknown>) => boolean> = [];
      const chain = {
        select: () => chain,
        eq(column: string, value: unknown) {
          filters.push((row) => row[column] === value);
          return chain;
        },
        in(column: string, values: unknown[]) {
          filters.push((row) => values.includes(row[column]));
          return chain;
        },
        then(resolve: (value: { data: unknown; error: null }) => unknown) {
          return resolve({
            data: (rows[table] ?? []).filter((row) => filters.every((f) => f(row))),
            error: null,
          });
        },
      };
      return chain;
    },
  } as never;
}

vi.mock("@/features/auth/server", () => ({
  resolveUserLinkedEntities: async (_db: unknown, _school: string, userId: string) => ({
    person_id: `person-of-${userId}`,
    student_id: null,
    teacher_id: userId === "prof-user" ? "teacher-1" : null,
    guardian_person_id: null,
    linked_students: [],
  }),
}));
vi.mock("@/features/students/student-scope", async (original) => {
  const actual = await original<typeof import("@/features/students/student-scope")>();
  return { ...actual, resolveVerifiedAccountEmail: async () => null };
});

const S = "school";
const db = fakeDb({
  class_subjects: [
    { school_id: S, class_group_id: "turma-A", teacher_id: "teacher-1", status: "active" },
    { school_id: S, class_group_id: "turma-B", teacher_id: "teacher-2", status: "active" },
    { school_id: S, class_group_id: "turma-C", teacher_id: "teacher-1", status: "inactive" },
  ],
  class_groups: [
    { school_id: S, id: "turma-D", homeroom_teacher_id: "teacher-1" },
    { school_id: S, id: "turma-B", homeroom_teacher_id: "teacher-2" },
  ],
  enrollments: [
    { school_id: S, class_group_id: "turma-A", student_id: "aluno-A", status: "active" },
    { school_id: S, class_group_id: "turma-B", student_id: "aluno-B", status: "active" },
    { school_id: S, class_group_id: "turma-C", student_id: "aluno-C", status: "active" },
    { school_id: S, class_group_id: "turma-D", student_id: "aluno-D", status: "pending" },
    { school_id: S, class_group_id: "turma-A", student_id: "aluno-saiu", status: "transferred" },
  ],
  students: [
    { school_id: S, id: "aluno-A", person_id: "pessoa-A" },
    { school_id: S, id: "aluno-D", person_id: "pessoa-D" },
    { school_id: S, id: "aluno-B", person_id: "pessoa-B" },
  ],
  student_guardians: [
    { school_id: S, student_id: "aluno-A", guardian_person_id: "encarregado-A" },
    { school_id: S, student_id: "aluno-B", guardian_person_id: "encarregado-B" },
  ],
});

describe("o professor só vê os alunos das turmas onde dá aulas", () => {
  it("turmas das disciplinas activas e as de director de turma; nada das outras", async () => {
    const { loadStudentScope, canSeeStudent, canSeePerson } =
      await import("@/features/students/student-scope");
    const scope = await loadStudentScope(db, { schoolId: S, appRole: "Professor" }, "prof-user");
    expect(scope.all).toBe(false);
    expect(canSeeStudent(scope, "aluno-A")).toBe(true);
    expect(canSeeStudent(scope, "aluno-D")).toBe(true);
    expect(canSeeStudent(scope, "aluno-B")).toBe(false);
    expect(canSeeStudent(scope, "aluno-C")).toBe(false); // disciplina inactiva
    expect(canSeeStudent(scope, "aluno-saiu")).toBe(false);
    expect(canSeePerson(scope, "encarregado-A")).toBe(true);
    expect(canSeePerson(scope, "encarregado-B")).toBe(false);
    expect(canSeePerson(scope, "person-of-prof-user")).toBe(true);
  });

  it("professor sem ficha docente não vê alunos", async () => {
    const { loadStudentScope } = await import("@/features/students/student-scope");
    const scope = await loadStudentScope(db, { schoolId: S, appRole: "Professor" }, "outro");
    expect(scope).toMatchObject({ all: false, studentIds: [] });
  });

  it("professor que também é da Secretaria vê todos", async () => {
    const { loadStudentScope } = await import("@/features/students/student-scope");
    const scope = await loadStudentScope(
      db,
      { schoolId: S, appRole: "Professor", allAppRoles: ["Professor", "Secretaria"] },
      "prof-user",
    );
    expect(scope.all).toBe(true);
  });

  it("Direcção, Secretaria e Tesouraria continuam a ver todos", async () => {
    const { loadStudentScope } = await import("@/features/students/student-scope");
    for (const role of ["Administrador", "Secretaria", "Tesouraria"]) {
      expect((await loadStudentScope(db, { schoolId: S, appRole: role }, "x")).all).toBe(true);
    }
  });
});
