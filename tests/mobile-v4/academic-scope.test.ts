import { describe, expect, it, vi } from "vitest";
import { resolveMobileAcademicScope } from "@/features/mobile-v4/academic-scope.server";

type Row = Record<string, unknown>;
type Filter = { field: string; values: unknown[] };
function database(overrides: Record<string, Row[]> = {}, fail?: string, cap?: string) {
  const data: Record<string, Row[]> = {
    people: [
      {
        id: "person-s",
        school_id: "A",
        user_id: "student-user",
        status: "active",
        deleted_at: null,
      },
      {
        id: "person-t",
        school_id: "A",
        user_id: "teacher-user",
        status: "active",
        deleted_at: null,
      },
      {
        id: "other-person",
        school_id: "B",
        user_id: "student-user",
        status: "active",
        deleted_at: null,
      },
    ],
    teachers: [
      {
        id: "teacher",
        school_id: "A",
        person_id: "person-t",
        user_id: "teacher-user",
        status: "active",
      },
    ],
    students: [
      { id: "student", school_id: "A", person_id: "person-s", status: "active", deleted_at: null },
      { id: "peer", school_id: "A", person_id: "peer-person", status: "active", deleted_at: null },
    ],
    academic_years: [{ id: "year", school_id: "A", status: "active" }],
    class_groups: [
      { id: "group", school_id: "A", academic_year_id: "year", status: "active" },
      { id: "other-group", school_id: "A", academic_year_id: "year", status: "active" },
      { id: "old-group", school_id: "A", academic_year_id: "old-year", status: "active" },
      { id: "foreign-group", school_id: "B", academic_year_id: "year", status: "active" },
    ],
    class_subjects: [
      {
        id: "subject",
        school_id: "A",
        class_group_id: "group",
        teacher_id: "teacher",
        status: "active",
      },
      {
        id: "other-subject",
        school_id: "A",
        class_group_id: "other-group",
        teacher_id: "other-teacher",
        status: "active",
      },
      {
        id: "old-subject",
        school_id: "A",
        class_group_id: "old-group",
        teacher_id: "teacher",
        status: "active",
      },
      {
        id: "foreign-subject",
        school_id: "B",
        class_group_id: "foreign-group",
        teacher_id: "teacher",
        status: "active",
      },
    ],
    enrollments: [
      {
        id: "own",
        school_id: "A",
        student_id: "student",
        class_group_id: "group",
        academic_year_id: "year",
        status: "active",
      },
      {
        id: "peer",
        school_id: "A",
        student_id: "peer",
        class_group_id: "group",
        academic_year_id: "year",
        status: "active",
      },
      {
        id: "unrelated",
        school_id: "A",
        student_id: "peer",
        class_group_id: "other-group",
        academic_year_id: "year",
        status: "active",
      },
      {
        id: "pending",
        school_id: "A",
        student_id: "student",
        class_group_id: "other-group",
        academic_year_id: "year",
        status: "pending",
      },
      {
        id: "withdrawn",
        school_id: "A",
        student_id: "student",
        class_group_id: "other-group",
        academic_year_id: "year",
        status: "withdrawn",
      },
    ],
    ...overrides,
  };
  const calls: { table: string; filters: Filter[] }[] = [];
  const db = {
    from: vi.fn((table: string) => {
      const filters: Filter[] = [];
      calls.push({ table, filters });
      let maximum = Infinity;
      function result(single = false) {
        const matching = (data[table] ?? []).filter((row) =>
          filters.every((f) => f.values.includes(row[f.field])),
        );
        const error =
          table === fail || (single && matching.length > 1) ? { message: "lookup failed" } : null;
        return {
          data: single ? (matching[0] ?? null) : matching.slice(0, table === cap ? 0 : maximum),
          error,
          count: matching.length,
        };
      }
      const chain = {
        select: () => chain,
        eq: (field: string, value: unknown) => {
          filters.push({ field, values: [value] });
          return chain;
        },
        is: (field: string, value: unknown) => chain.eq(field, value),
        in: (field: string, values: unknown[]) => {
          filters.push({ field, values });
          return chain;
        },
        limit: (value: number) => {
          maximum = value;
          return chain;
        },
        maybeSingle: async () => result(true),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
      };
      return chain;
    }),
  };
  return { db: db as unknown as Parameters<typeof resolveMobileAcademicScope>[0], calls };
}

describe("Mobile canonical academic scope (controlled database adapter)", () => {
  it("restricts teacher to active assigned disciplines and their active roster", async () => {
    const { db, calls } = database();
    const scope = await resolveMobileAcademicScope(db, "teacher-user", "A", "professor");
    expect(scope).toEqual({
      schoolId: "A",
      role: "professor",
      teacherId: "teacher",
      studentId: null,
      classGroupIds: ["group"],
      classSubjectIds: ["subject"],
      enrollmentIds: ["own", "peer"],
    });
    expect(
      calls.every((call) =>
        call.filters.some((f) => f.field === "school_id" && f.values[0] === "A"),
      ),
    ).toBe(true);
  });
  it("gives the teacher the same roster as the portal call: active and pending, never withdrawn", async () => {
    const row = (id: string, status: string) => ({
      id,
      school_id: "A",
      student_id: id === "own" ? "student" : id,
      class_group_id: "group",
      academic_year_id: "year",
      status,
    });
    const { db } = database({
      enrollments: [
        row("own", "active"),
        row("new", "pending"),
        row("gone", "withdrawn"),
        row("moved", "transferred"),
        row("ended", "cancelled"),
      ],
    });
    expect(
      (await resolveMobileAcademicScope(db, "teacher-user", "A", "professor")).enrollmentIds,
    ).toEqual(["own", "new"]);
    expect(
      (await resolveMobileAcademicScope(db, "student-user", "A", "aluno")).enrollmentIds,
    ).toEqual(["own"]);
  });
  it("does not include classmates, pending or withdrawn enrollments in student scope", async () => {
    const { db } = database();
    expect(await resolveMobileAcademicScope(db, "student-user", "A", "aluno")).toEqual({
      schoolId: "A",
      role: "aluno",
      teacherId: null,
      studentId: "student",
      classGroupIds: ["group"],
      classSubjectIds: ["subject"],
      enrollmentIds: ["own"],
    });
  });
  it("does not infer a student record from an ID equal to the user ID", async () => {
    const { db } = database({
      people: [],
      students: [{ id: "student-user", school_id: "A", status: "active", deleted_at: null }],
    });
    await expect(
      resolveMobileAcademicScope(db, "student-user", "A", "aluno"),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("accepts a teacher bound through the verified people.user_id relation", async () => {
    const { db } = database({
      teachers: [
        { id: "teacher", school_id: "A", person_id: "person-t", user_id: null, status: "active" },
      ],
    });
    expect((await resolveMobileAcademicScope(db, "teacher-user", "A", "professor")).teacherId).toBe(
      "teacher",
    );
  });
  it("rejects contradictory teacher and person account bindings", async () => {
    const { db } = database({
      teachers: [
        {
          id: "teacher",
          school_id: "A",
          person_id: "wrong-person",
          user_id: "teacher-user",
          status: "active",
        },
      ],
    });
    await expect(
      resolveMobileAcademicScope(db, "teacher-user", "A", "professor"),
    ).rejects.toMatchObject({ code: "ACADEMIC_IDENTITY_CONFLICT" });
  });
  it("rejects a linked teacher belonging to a different account", async () => {
    const { db } = database({
      teachers: [
        {
          id: "teacher",
          school_id: "A",
          person_id: "person-t",
          user_id: "someone-else",
          status: "active",
        },
      ],
    });
    await expect(
      resolveMobileAcademicScope(db, "teacher-user", "A", "professor"),
    ).rejects.toMatchObject({ code: "ACADEMIC_IDENTITY_CONFLICT" });
  });
  it("checks the direct teacher's person binding even without a people.user_id match", async () => {
    const { db } = database({
      people: [
        {
          id: "person-t",
          school_id: "A",
          user_id: "other-user",
          status: "active",
          deleted_at: null,
        },
      ],
    });
    await expect(
      resolveMobileAcademicScope(db, "teacher-user", "A", "professor"),
    ).rejects.toMatchObject({ code: "ACADEMIC_IDENTITY_CONFLICT" });
  });
  it("accepts a direct teacher account with an active unbound person", async () => {
    const { db } = database({
      people: [
        { id: "person-t", school_id: "A", user_id: null, status: "active", deleted_at: null },
      ],
    });
    expect((await resolveMobileAcademicScope(db, "teacher-user", "A", "professor")).teacherId).toBe(
      "teacher",
    );
  });
  it("rejects a direct teacher linked to a deleted person", async () => {
    const { db } = database({
      people: [
        {
          id: "person-t",
          school_id: "A",
          user_id: "teacher-user",
          status: "active",
          deleted_at: "2026-10-01",
        },
      ],
    });
    await expect(
      resolveMobileAcademicScope(db, "teacher-user", "A", "professor"),
    ).rejects.toMatchObject({ code: "ACADEMIC_IDENTITY_REQUIRED" });
  });
  it("does not use another school's identity for the requested school", async () => {
    const { db } = database({
      people: [
        {
          id: "other-person",
          school_id: "B",
          user_id: "student-user",
          status: "active",
          deleted_at: null,
        },
      ],
    });
    await expect(
      resolveMobileAcademicScope(db, "student-user", "A", "aluno"),
    ).rejects.toMatchObject({ code: "ACADEMIC_IDENTITY_REQUIRED" });
  });
  it.each([
    "people",
    "teachers",
    "academic_years",
    "class_groups",
    "class_subjects",
    "enrollments",
  ])("fails closed on %s errors", async (table) => {
    const { db } = database({}, table);
    await expect(
      resolveMobileAcademicScope(db, "teacher-user", "A", "professor"),
    ).rejects.toMatchObject({ status: 503 });
  });
  it("rejects ambiguous duplicate identities instead of picking the first", async () => {
    const { db } = database({
      people: [
        { id: "one", school_id: "A", user_id: "student-user", status: "active", deleted_at: null },
        { id: "two", school_id: "A", user_id: "student-user", status: "active", deleted_at: null },
      ],
    });
    await expect(
      resolveMobileAcademicScope(db, "student-user", "A", "aluno"),
    ).rejects.toMatchObject({ status: 503 });
  });
  it.each(["academic_years", "class_groups", "class_subjects", "enrollments"])(
    "refuses a truncated %s response",
    async (table) => {
      const { db } = database({}, undefined, table);
      await expect(
        resolveMobileAcademicScope(db, "teacher-user", "A", "professor"),
      ).rejects.toMatchObject({ code: "ACADEMIC_SCOPE_UNAVAILABLE" });
    },
  );
  it("returns an empty authorized scope for a teacher without assignments", async () => {
    const { db } = database({ class_subjects: [] });
    const scope = await resolveMobileAcademicScope(db, "teacher-user", "A", "professor");
    expect(scope.classSubjectIds).toEqual([]);
    expect(scope.classGroupIds).toEqual([]);
    expect(scope.enrollmentIds).toEqual([]);
  });
  it("does not query all disciplines when the student has no active enrollment", async () => {
    const { db, calls } = database({ enrollments: [] });
    expect(
      (await resolveMobileAcademicScope(db, "student-user", "A", "aluno")).classSubjectIds,
    ).toEqual([]);
    expect(calls.some((call) => call.table === "class_subjects")).toBe(false);
  });
});
