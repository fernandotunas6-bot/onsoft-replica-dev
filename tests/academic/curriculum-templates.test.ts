import { describe, expect, it } from "vitest";
import {
  EDUCATION_LEVELS,
  SUBJECTS,
  planCurriculum,
  summarizePlan,
  type TemplateSelection,
} from "@/features/academic/curriculum-templates";
import { applyCurriculumPlan, type ApplyDb } from "@/features/academic/curriculum-templates-apply";

const base: Omit<TemplateSelection, "courses"> = {
  groupsPerGrade: 1,
  shifts: ["morning"],
  capacity: 35,
  createRooms: true,
};

describe("modelos de estrutura académica", () => {
  it("II Ciclo: 10ª, 11ª e 12ª classe por área, com turmas «10ª CFB A — Manhã»", () => {
    const plan = planCurriculum({ ...base, courses: { secundario_2: ["CFB", "CEJ"] } });
    expect(plan.grades.map((g) => g.name)).toEqual([
      "10ª Classe · CFB",
      "11ª Classe · CFB",
      "12ª Classe · CFB",
      "10ª Classe · CEJ",
      "11ª Classe · CEJ",
      "12ª Classe · CEJ",
    ]);
    expect(plan.programs.map((p) => p.code)).toEqual(["ESG2-CFB", "ESG2-CEJ"]);
    expect(plan.classGroups[0]).toMatchObject({ code: "CFB10A-M", name: "10ª CFB A — Manhã" });
    expect(plan.subjects.map((s) => s.code)).toContain("GEOL");
  });

  it("Primário: 1ª à 6ª classe; Estudo do Meio só até à 4ª", () => {
    const plan = planCurriculum({ ...base, courses: { primario: ["EP"] } });
    expect(plan.grades.map((g) => g.sequence)).toEqual([1, 2, 3, 4, 5, 6]);
    const quarta = plan.curriculum.find((c) => c.gradeCode === "4CL")!;
    const quinta = plan.curriculum.find((c) => c.gradeCode === "5CL")!;
    expect(quarta.subjectCodes).toContain("EM");
    expect(quinta.subjectCodes).not.toContain("EM");
    expect(quinta.subjectCodes).toEqual(expect.arrayContaining(["CN", "HIST", "GEO"]));
  });

  it("Técnico-profissional vai até à 13ª classe, com Projecto Tecnológico no fim", () => {
    const plan = planCurriculum({ ...base, courses: { tecnico: ["INF"] } });
    expect(plan.grades.map((g) => g.name).at(-1)).toBe("13ª Classe · INF");
    expect(plan.curriculum.find((c) => c.gradeCode === "13CL")!.subjectCodes).toContain("PT");
    expect(plan.rooms.map((r) => r.code)).toEqual(expect.arrayContaining(["LAB-INF", "OFICINA"]));
  });

  it("Superior: anos em vez de classes e perfil de avaliação do superior", () => {
    const plan = planCurriculum({ ...base, courses: { superior: ["DIR", "EINF"] } });
    expect(plan.grades.filter((g) => g.programCode === "ES-DIR").map((g) => g.name)).toEqual([
      "1º Ano · DIR",
      "2º Ano · DIR",
      "3º Ano · DIR",
      "4º Ano · DIR",
      "5º Ano · DIR",
    ]);
    expect(plan.programs.every((p) => p.kind === "undergraduate" && p.higherEducation)).toBe(true);
    expect(plan.classGroups[0]).toMatchObject({ code: "DIR1A-M", name: "1º Ano DIR A — Manhã" });
  });

  it("salas: uma por turma do mesmo turno, partilhadas entre turnos", () => {
    const plan = planCurriculum({
      ...base,
      groupsPerGrade: 2,
      shifts: ["morning", "afternoon"],
      courses: { secundario_1: ["ESG1"] },
    });
    // 3 classes × 2 turmas por turno = 6 salas; 12 turmas nos dois turnos.
    expect(plan.classGroups).toHaveLength(12);
    expect(plan.rooms.filter((r) => r.type === "standard").map((r) => r.name)).toEqual([
      "Sala 1",
      "Sala 2",
      "Sala 3",
      "Sala 4",
      "Sala 5",
      "Sala 6",
    ]);
  });

  it("todos os códigos respeitam as restrições da base", () => {
    const all = Object.fromEntries(
      EDUCATION_LEVELS.map((l) => [l.id, l.courses.map((c) => c.code)]),
    );
    const plan = planCurriculum({
      ...base,
      groupsPerGrade: 3,
      shifts: ["morning", "afternoon", "evening"],
      courses: all,
    });
    for (const s of plan.subjects) expect(s.code).toMatch(/^[A-Z0-9_-]{2,20}$/);
    for (const g of plan.classGroups) expect(g.code).toMatch(/^[A-Z0-9_-]{2,30}$/);
    const groupCodes = plan.classGroups.map((g) => g.code);
    expect(new Set(groupCodes).size).toBe(groupCodes.length);
    const programCodes = plan.programs.map((p) => p.code);
    expect(new Set(programCodes).size).toBe(programCodes.length);
    for (const c of plan.curriculum)
      for (const code of c.subjectCodes) expect(SUBJECTS[code]).toBeTruthy();
    expect(summarizePlan(plan).cursos).toBe(programCodes.length);
  });

  it("sem nada escolhido não há plano", () => {
    expect(summarizePlan(planCurriculum({ ...base, courses: {} })).cursos).toBe(0);
  });
});

/** Base falsa que guarda os upserts e devolve ids. */
function fakeDb(opts: {
  withYear: boolean;
  existingSubjects?: Array<{ code: string; name: string }>;
}) {
  const writes: Record<string, Array<Record<string, unknown>>> = {};
  const rows: Record<string, Array<Record<string, unknown>>> = {
    subjects: (opts.existingSubjects ?? []).map((s, i) => ({ id: `old-${i}`, ...s })),
  };
  let seq = 0;
  const db = {
    from(table: string) {
      let pending: Array<Record<string, unknown>> | null = null;
      const q: Record<string, unknown> = {};
      const resolveList = () => {
        if (pending) {
          const inserted = pending.map((r) => ({ id: `${table}-${++seq}`, ...r }));
          rows[table] = [...(rows[table] ?? []), ...inserted];
          (writes[table] ??= []).push(...pending);
          pending = null;
          return { data: inserted, error: null };
        }
        if (table === "academic_years")
          return { data: opts.withYear ? [{ id: "year-1" }] : [], error: null };
        return { data: rows[table] ?? [], error: null };
      };
      Object.assign(q, {
        select: () => q,
        eq: () => q,
        in: () => q,
        is: () => q,
        order: () => q,
        limit: () => q,
        upsert: (r: Array<Record<string, unknown>>) => ((pending = r), q),
        insert: (r: Record<string, unknown>) => ((pending = [r]), q),
        maybeSingle: async () => ({ data: resolveList().data?.[0] ?? null, error: null }),
        single: async () => ({ data: resolveList().data?.[0] ?? null, error: null }),
        then: (resolve: (v: unknown) => void) => resolve(resolveList()),
      });
      return q;
    },
  };
  return { db: db as unknown as ApplyDb, writes };
}

describe("aplicar o modelo", () => {
  const plan = planCurriculum({ ...base, courses: { secundario_1: ["ESG1"] } });

  it("cria tudo, incluindo turmas com sala e currículos, quando há ano lectivo", async () => {
    const { db, writes } = fakeDb({ withYear: true });
    const result = await applyCurriculumPlan(db, { schoolId: "s1", userId: "u1" }, plan);
    expect(result.pendingWithoutYear).toBe(false);
    expect(result.created.classes).toBe(3);
    expect(result.created.turmas).toBe(3);
    expect(writes["class_groups"]![0]).toMatchObject({
      academic_year_id: "year-1",
      code: "7A-M",
      created_by: "u1",
    });
    expect(writes["class_groups"]![0]!["room_id"]).toBeTruthy();
    expect(writes["curriculum_subjects"]!.length).toBeGreaterThan(0);
  });

  it("sem ano lectivo: estrutura sim, turmas e currículos ficam para depois", async () => {
    const { db, writes } = fakeDb({ withYear: false });
    const result = await applyCurriculumPlan(db, { schoolId: "s1", userId: "u1" }, plan);
    expect(result.pendingWithoutYear).toBe(true);
    expect(writes["class_groups"]).toBeUndefined();
    expect(writes["grade_levels"]).toHaveLength(3);
  });

  it("reaproveita disciplinas já existentes com o mesmo nome", async () => {
    const { db, writes } = fakeDb({
      withYear: true,
      existingSubjects: [{ code: "PORT", name: "Língua Portuguesa" }],
    });
    await applyCurriculumPlan(db, { schoolId: "s1", userId: "u1" }, plan);
    expect(writes["subjects"]!.map((s) => s["code"])).not.toContain("LP");
    expect(writes["curriculum_subjects"]!.map((l) => l["subject_id"])).toContain("old-0");
  });
});
