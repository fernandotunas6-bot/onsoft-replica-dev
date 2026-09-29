import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertCanSeeStudent,
  canSeePerson,
  studentScopeFor,
} from "@/features/students/student-scope";

const linked = {
  person_id: "p-own",
  student_id: "s-own",
  linked_students: [{ student_id: "s-child" }],
};

describe("que alunos cada conta pode ver", () => {
  it("o pessoal da escola vê todos", () => {
    for (const role of ["Administrador", "Secretaria", "Tesouraria", "Professor"]) {
      expect(studentScopeFor(role, linked)).toEqual({ all: true });
    }
  });

  it("o aluno vê só o seu cadastro", () => {
    const scope = studentScopeFor("Aluno", linked);
    expect(() => assertCanSeeStudent(scope, "s-own")).not.toThrow();
    expect(() => assertCanSeeStudent(scope, "s-child")).toThrow();
    expect(canSeePerson(scope, "p-own")).toBe(true);
    expect(canSeePerson(scope, "p-x")).toBe(false);
  });

  it("o encarregado vê os educandos, não o próprio número de aluno", () => {
    const scope = studentScopeFor("Encarregado", linked, ["p-child"]);
    expect(() => assertCanSeeStudent(scope, "s-child")).not.toThrow();
    expect(() => assertCanSeeStudent(scope, "s-own")).toThrow();
    expect(canSeePerson(scope, "p-child")).toBe(true);
  });

  it("uma conta sem papel escolar não vê ninguém", () => {
    const scope = studentScopeFor("Utilizador", linked);
    expect(scope).toEqual({ all: false, studentIds: [], personIds: ["p-own"] });
  });
});

describe("funções que lêem fichas de alunos e pessoas aplicam o âmbito", () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
  const body = (source: string, name: string) => {
    const start = source.indexOf(`export const ${name} `);
    const next = source.indexOf("export const ", start + 1);
    return source.slice(start, next === -1 ? undefined : next);
  };
  const cases: Array<[string, string[]]> = [
    [
      "src/features/students/server.ts",
      ["searchStudents", "getStudentProfile", "getStudentStatusHistory"],
    ],
    ["src/features/academic/server-legacy.ts", ["getStudentAcademicHistory"]],
    ["src/features/people/server.ts", ["getPerson", "searchPeople"]],
    ["src/features/documents/server.ts", ["listDocumentWorkspace"]],
    [
      "src/features/pedagogica/attendance-server.ts",
      ["submitAttendanceJustification", "getStudentAttendanceHistory"],
    ],
  ];
  for (const [path, names] of cases) {
    const source = read(path);
    for (const name of names) {
      it(name, () => expect(body(source, name)).toMatch(/loadStudentScope\(/));
    }
  }
});

describe("leituras da escola inteira só para o pessoal", () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
  const body = (source: string, name: string) => {
    const start = source.indexOf(`export const ${name} `);
    const next = source.indexOf("export const ", start + 1);
    return source.slice(start, next === -1 ? undefined : next);
  };
  const cases: Array<[string, string[], RegExp]> = [
    [
      "src/features/communications/dispatches-server.ts",
      ["listSchoolCommunicationDispatches", "getCommunicationDispatchStats"],
      /requireSgaWriterFor\(/,
    ],
    [
      "src/features/alumni/operations.ts",
      ["listAlumniSurveys", "getAlumniImpactAnalytics"],
      /requireSgaWriterFor\(/,
    ],
    [
      "src/features/academic/server-legacy.ts",
      ["listTermGrades", "listAssessments", "getTeacherWorkspace", "listPedagogicalWorkspace"],
      /requireAcademicManager\(/,
    ],
    [
      "src/features/lesson-plans/server.ts",
      ["listLessonPlans", "getLessonPlan"],
      /isLessonPlanStaff\(/,
    ],
    ["src/features/communications/server.ts", ["listSchoolAnnouncements"], /"teaching_staff"/],
    [
      "src/features/pedagogica/attendance-server.ts",
      ["getAttendanceCallSheet"],
      /requireSgaWriterFor\("pedagogica"/,
    ],
    [
      "src/features/pedagogica/attendance-server.ts",
      ["submitAttendanceCallBatch"],
      /não estão matriculados nesta turma/,
    ],
    [
      "src/features/pedagogica/attendance-server.ts",
      ["editFinalizedAttendanceCall"],
      /não estão matriculados nesta turma[\s\S]*|corrigir a chamada de outro professor/,
    ],
    [
      "src/features/academic/server-legacy.ts",
      ["upsertAssessmentScores"],
      /"grades\.assessment_score_changed"/,
    ],
  ];
  for (const [path, names, guard] of cases) {
    const source = read(path);
    for (const name of names) {
      it(name, () => expect(body(source, name)).toMatch(guard));
    }
  }
});
