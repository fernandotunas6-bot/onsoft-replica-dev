import { describe, expect, it } from "vitest";
import { readMobileLessonPlans } from "@/features/mobile-v4/lesson-plans.server";
import type { MobileAcademicScope } from "@/features/mobile-v4/academic-scope.server";
import type { AcademicCatalog } from "../../mobile-v4/src/domain/catalog";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const SCHOOL = id(1);
const USER = id(2);
const TEACHER = id(3);
// Professor dá Matemática (210) na turma 110 e Física (211) na turma 111.
const catalog: AcademicCatalog = {
  schoolId: SCHOOL,
  role: "professor",
  classes: [
    {
      classSubjectId: id(10),
      classGroupId: id(110),
      academicYearId: id(300),
      className: "10.ª A",
      subjectId: id(210),
      subjectName: "Matemática",
      teacher: { id: TEACHER, name: "Prof", userId: USER },
      students: [],
    },
    {
      classSubjectId: id(11),
      classGroupId: id(111),
      academicYearId: id(300),
      className: "10.ª B",
      subjectId: id(211),
      subjectName: "Física",
      teacher: { id: TEACHER, name: "Prof", userId: USER },
      students: [],
    },
  ],
  timetable: [],
  tasks: [],
};
const scope: MobileAcademicScope = {
  schoolId: SCHOOL,
  role: "professor",
  teacherId: TEACHER,
  studentId: null,
  classGroupIds: [id(110), id(111)],
  classSubjectIds: [id(10), id(11)],
  enrollmentIds: [],
};
const plan = (n: number, group: number, subject: number, extra: Record<string, unknown> = {}) => ({
  id: id(n),
  class_group_id: id(group),
  subject_id: id(subject),
  term: 1,
  title: `Plano ${n}`,
  content: "Objectivos\n- frações",
  file_name: null,
  status: "published",
  updated_at: "2026-10-08T10:00:00.123456+00:00",
  ...extra,
});
type Filters = [string, string, unknown][];
function database(tables: Record<string, Record<string, unknown>[]>, count?: number) {
  const calls: { table: string; filters: Filters }[] = [];
  return {
    calls,
    db: {
      from(table: string) {
        const filters: Filters = [];
        calls.push({ table, filters });
        const chain: Record<string, unknown> = {
          select: () => chain,
          limit: () => chain,
          eq: (f: string, v: unknown) => (filters.push(["eq", f, v]), chain),
          in: (f: string, v: unknown[]) => (filters.push(["in", f, v]), chain),
          then: (resolve: (v: unknown) => void) => {
            const rows = (tables[table] ?? []).filter((r) =>
              filters.every(([op, f, v]) =>
                op === "eq" ? r[f] === v : (v as unknown[]).includes(r[f]),
              ),
            );
            resolve({ data: rows, count: count ?? rows.length, error: null });
          },
        };
        return chain;
      },
    } as never,
  };
}

describe("planos de aula do professor no Mobile", () => {
  it("só os pares turma-disciplina que lecciona, com rascunhos e componentes por ordem", async () => {
    const { db, calls } = database({
      siga_lesson_plans: [
        { school_id: SCHOOL, ...plan(20, 110, 210) },
        { school_id: SCHOOL, ...plan(21, 111, 211, { status: "draft", term: 2, content: "  " }) },
        // Turma dele com a disciplina que dá noutra turma: não é dele.
        { school_id: SCHOOL, ...plan(22, 110, 211) },
        { school_id: id(9), ...plan(23, 110, 210) },
      ],
      siga_lesson_plan_components: [
        {
          school_id: SCHOOL,
          lesson_plan_id: id(20),
          kind: "prova",
          name: "Prova 1",
          planned_count: 1,
          sequence: 2,
        },
        {
          school_id: SCHOOL,
          lesson_plan_id: id(20),
          kind: "avaliacao",
          name: "MAC",
          planned_count: 2,
          sequence: 1,
        },
      ],
    });
    const result = await readMobileLessonPlans(db, scope, catalog, USER);
    expect(result.plans.map((p) => [p.id, p.classSubjectId, p.status, p.term])).toEqual([
      [id(20), id(10), "published", 1],
      [id(21), id(11), "draft", 2],
    ]);
    expect(result.plans[0]!.components).toEqual([
      { kind: "avaliacao", name: "MAC", plannedCount: 2 },
      { kind: "prova", name: "Prova 1", plannedCount: 1 },
    ]);
    expect(result.plans[1]!.content).toBeNull();
    expect(
      calls.every((c) =>
        c.filters.some(([op, f, v]) => op === "eq" && f === "school_id" && v === SCHOOL),
      ),
    ).toBe(true);
  });

  it("pede os componentes de muitos planos em pedaços curtos", async () => {
    const many = Array.from({ length: 400 }, (_, i) => ({
      school_id: SCHOOL,
      ...plan(1000 + i, 110, 210),
    }));
    const { db, calls } = database({ siga_lesson_plans: many, siga_lesson_plan_components: [] });
    expect((await readMobileLessonPlans(db, scope, catalog, USER)).plans).toHaveLength(400);
    const parts = calls.filter((c) => c.table === "siga_lesson_plan_components");
    expect(parts).toHaveLength(3);
    for (const c of parts) {
      const ids = c.filters.find(
        ([op, f]) => op === "in" && f === "lesson_plan_id",
      )![2] as string[];
      expect(ids.length).toBeLessThanOrEqual(150);
    }
  });

  it("um aluno nunca chega aqui e uma leitura truncada não é dada como completa", async () => {
    await expect(
      readMobileLessonPlans(database({}).db, { ...scope, role: "aluno" }, catalog, USER),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      readMobileLessonPlans(
        database({ siga_lesson_plans: [{ school_id: SCHOOL, ...plan(20, 110, 210) }] }, 2).db,
        scope,
        catalog,
        USER,
      ),
    ).rejects.toMatchObject({ status: 503, code: "LESSON_PLANS_UNAVAILABLE" });
  });

  it("um estado ou trimestre desconhecido falha em vez de aparecer errado", async () => {
    await expect(
      readMobileLessonPlans(
        database({ siga_lesson_plans: [{ school_id: SCHOOL, ...plan(20, 110, 210, { term: 4 }) }] })
          .db,
        scope,
        catalog,
        USER,
      ),
    ).rejects.toMatchObject({ status: 503, code: "LESSON_PLANS_INCONSISTENT" });
  });
});
