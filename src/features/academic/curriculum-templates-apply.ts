/**
 * Grava um `CurriculumPlan` na escola. Idempotente: tudo é inserido com
 * `ON CONFLICT DO NOTHING` pelas chaves únicas da base, por isso aplicar o
 * mesmo modelo duas vezes — ou por cima do que a escola já criou — não
 * duplica nem altera nada existente.
 *
 * Recebe o cliente já autorizado (ver curriculum-templates-server.ts): este
 * ficheiro não decide quem pode escrever.
 */
import type { CurriculumPlan } from "./curriculum-templates";

type Row = Record<string, unknown>;
type Result<T> = PromiseLike<{ data: T | null; error: { message: string } | null }>;
type Query = {
  select: (columns: string) => Query & Result<Row[]>;
  eq: (column: string, value: unknown) => Query & Result<Row[]>;
  in: (column: string, values: unknown[]) => Query & Result<Row[]>;
  is: (column: string, value: null) => Query & Result<Row[]>;
  limit: (n: number) => Query & Result<Row[]>;
  maybeSingle: () => Result<Row>;
  single: () => Result<Row>;
};
export type ApplyDb = {
  from: (table: string) => {
    select: (columns: string) => Query & Result<Row[]>;
    insert: (rows: Row | Row[]) => Query & Result<Row[]>;
    upsert: (
      rows: Row[],
      options: { onConflict: string; ignoreDuplicates: boolean },
    ) => Query & Result<Row[]>;
  };
};

export type ApplyResult = {
  created: {
    niveis: number;
    cursos: number;
    classes: number;
    disciplinas: number;
    turmas: number;
    salas: number;
    curriculos: number;
  };
  /** Sem ano lectivo activo não se criam turmas nem currículos: ficam para depois. */
  pendingWithoutYear: boolean;
};

function fail(error: { message: string } | null, what: string): void {
  if (error) throw new Error(`Não foi possível criar ${what}: ${error.message}`);
}

const normalizeName = (value: string) =>
  value.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

export async function applyCurriculumPlan(
  db: ApplyDb,
  ctx: { schoolId: string; userId: string },
  plan: CurriculumPlan,
): Promise<ApplyResult> {
  const { schoolId, userId } = ctx;
  const created: ApplyResult["created"] = {
    niveis: 0,
    cursos: 0,
    classes: 0,
    disciplinas: 0,
    turmas: 0,
    salas: 0,
    curriculos: 0,
  };
  const audit = { created_by: userId, updated_by: userId };

  // 1. Níveis de ensino.
  if (plan.levels.length) {
    const { data, error } = await db
      .from("academic_levels")
      .upsert(
        plan.levels.map((l) => ({ school_id: schoolId, ...l, is_active: true })),
        { onConflict: "school_id,code", ignoreDuplicates: true },
      )
      .select("id");
    fail(error, "os níveis de ensino");
    created.niveis = data?.length ?? 0;
  }
  const { data: levelRows, error: levelErr } = await db
    .from("academic_levels")
    .select("id, code")
    .eq("school_id", schoolId);
  fail(levelErr, "os níveis de ensino");
  const levelId = new Map((levelRows ?? []).map((r) => [String(r["code"]), String(r["id"])]));

  // 2. Cursos (programs).
  const programRows = plan.programs
    .filter((p) => levelId.has(p.levelCode))
    .map((p) => ({
      school_id: schoolId,
      academic_level_id: levelId.get(p.levelCode),
      code: p.code,
      name: p.name,
      kind: p.kind,
      is_active: true,
      // Ensino superior: escala 0–20 com frequência e exame (perfil aceite pela base).
      grading_profile: p.higherEducation
        ? { scale: "20_ects", components: "frequencia_exame" }
        : null,
    }));
  if (programRows.length) {
    const { data, error } = await db
      .from("programs")
      .upsert(programRows, { onConflict: "school_id,code", ignoreDuplicates: true })
      .select("id");
    fail(error, "os cursos");
    created.cursos = data?.length ?? 0;
  }
  const { data: programData, error: programErr } = await db
    .from("programs")
    .select("id, code, name")
    .eq("school_id", schoolId);
  fail(programErr, "os cursos");
  const programs = new Map(
    (programData ?? []).map((r) => [
      String(r["code"]),
      { id: String(r["id"]), name: String(r["name"]) },
    ]),
  );

  // 3. Classes / anos.
  const gradeRows = plan.grades
    .filter((g) => programs.has(g.programCode))
    .map((g) => ({
      school_id: schoolId,
      program_id: programs.get(g.programCode)!.id,
      code: g.code,
      name: g.name,
      sequence: g.sequence,
      is_active: true,
    }));
  if (gradeRows.length) {
    const { data, error } = await db
      .from("grade_levels")
      .upsert(gradeRows, { onConflict: "school_id,program_id,code", ignoreDuplicates: true })
      .select("id");
    fail(error, "as classes");
    created.classes = data?.length ?? 0;
  }
  const { data: gradeData, error: gradeErr } = await db
    .from("grade_levels")
    .select("id, program_id, code, name")
    .eq("school_id", schoolId);
  fail(gradeErr, "as classes");
  const gradeKey = (programId: string, code: string) => `${programId}|${code}`;
  const grades = new Map(
    (gradeData ?? []).map((r) => [
      gradeKey(String(r["program_id"]), String(r["code"])),
      { id: String(r["id"]), name: String(r["name"]) },
    ]),
  );

  // 4. Disciplinas. Uma disciplina já existente com o mesmo nome (criada à mão
  // ou pelo bootstrap antigo, com outro código) é reaproveitada.
  const { data: existingSubjects, error: subjErr } = await db
    .from("subjects")
    .select("id, code, name")
    .eq("school_id", schoolId);
  fail(subjErr, "as disciplinas");
  const subjectByCode = new Map<string, string>();
  const subjectByName = new Map<string, string>();
  for (const r of existingSubjects ?? []) {
    subjectByCode.set(String(r["code"]), String(r["id"]));
    subjectByName.set(normalizeName(String(r["name"])), String(r["id"]));
  }
  const newSubjects = plan.subjects.filter(
    (s) => !subjectByCode.has(s.code) && !subjectByName.has(normalizeName(s.name)),
  );
  if (newSubjects.length) {
    const { data, error } = await db
      .from("subjects")
      .upsert(
        newSubjects.map((s, i) => ({
          school_id: schoolId,
          code: s.code,
          name: s.name,
          short_name: s.short,
          status: "active",
          display_order: i + 1,
          ...audit,
        })),
        { onConflict: "school_id,code", ignoreDuplicates: true },
      )
      .select("id, code");
    fail(error, "as disciplinas");
    created.disciplinas = data?.length ?? 0;
    for (const r of data ?? []) subjectByCode.set(String(r["code"]), String(r["id"]));
  }
  const subjectId = (code: string) => {
    const def = plan.subjects.find((s) => s.code === code);
    return (
      subjectByCode.get(code) ?? (def ? subjectByName.get(normalizeName(def.name)) : undefined)
    );
  };

  // 5. Salas (não dependem do ano).
  if (plan.rooms.length) {
    const { data, error } = await db
      .from("rooms")
      .upsert(
        plan.rooms.map((r) => ({
          school_id: schoolId,
          code: r.code,
          name: r.name,
          room_type: r.type,
          capacity: r.capacity,
          status: "active",
          ...audit,
        })),
        { onConflict: "school_id,code", ignoreDuplicates: true },
      )
      .select("id");
    fail(error, "as salas");
    created.salas = data?.length ?? 0;
  }

  // 6. Turmas e currículos precisam do ano lectivo activo.
  const { data: year } = await db
    .from("academic_years")
    .select("id")
    .eq("school_id", schoolId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (!year?.["id"]) return { created, pendingWithoutYear: true };
  const yearId = String(year["id"]);

  // `class_groups.campus_id` é NOT NULL: usa o campus existente ou cria a sede.
  let { data: campus } = await db
    .from("campuses")
    .select("id")
    .eq("school_id", schoolId)
    .limit(1)
    .maybeSingle();
  if (!campus?.["id"]) {
    const inserted = await db
      .from("campuses")
      .insert({ school_id: schoolId, code: "SEDE", name: "Campus Principal", is_active: true })
      .select("id")
      .single();
    fail(inserted.error, "o campus");
    campus = inserted.data;
  }
  const campusId = String(campus!["id"]);

  // Turmas do mesmo turno ficam em salas diferentes; turnos diferentes partilham.
  const { data: roomData } = await db.from("rooms").select("id, code").eq("school_id", schoolId);
  const roomId = new Map((roomData ?? []).map((r) => [String(r["code"]), String(r["id"])]));
  const perShift = new Map<string, number>();
  const groupRows = plan.classGroups.flatMap((g) => {
    const program = programs.get(g.programCode);
    const grade = program ? grades.get(gradeKey(program.id, g.gradeCode)) : undefined;
    if (!grade) return [];
    const index = (perShift.get(g.shift) ?? 0) + 1;
    perShift.set(g.shift, index);
    return [
      {
        school_id: schoolId,
        academic_year_id: yearId,
        campus_id: campusId,
        grade_level_id: grade.id,
        code: g.code,
        name: g.name,
        shift: g.shift,
        capacity: g.capacity,
        status: "active",
        room_id: roomId.get(`S${String(index).padStart(2, "0")}`) ?? null,
        ...audit,
      },
    ];
  });
  if (groupRows.length) {
    const { data, error } = await db
      .from("class_groups")
      .upsert(groupRows, {
        onConflict: "school_id,academic_year_id,code",
        ignoreDuplicates: true,
      })
      .select("id");
    fail(error, "as turmas");
    created.turmas = data?.length ?? 0;
  }

  // Currículo: que disciplinas tem cada classe de cada curso, neste ano.
  const curriculumRows = plan.curriculum.flatMap((c) => {
    const program = programs.get(c.programCode);
    const grade = program ? grades.get(gradeKey(program.id, c.gradeCode)) : undefined;
    if (!program || !grade) return [];
    return [
      {
        school_id: schoolId,
        academic_year_id: yearId,
        course_id: program.id,
        grade_level_id: grade.id,
        name: `${program.name} — ${grade.name}`,
        status: "active",
        ...audit,
      },
    ];
  });
  if (curriculumRows.length) {
    const { data, error } = await db
      .from("curricula")
      .upsert(curriculumRows, {
        onConflict: "school_id,academic_year_id,course_id,grade_level_id",
        ignoreDuplicates: true,
      })
      .select("id");
    fail(error, "os currículos");
    created.curriculos = data?.length ?? 0;
  }
  const { data: curriculaData, error: curErr } = await db
    .from("curricula")
    .select("id, course_id, grade_level_id")
    .eq("school_id", schoolId)
    .eq("academic_year_id", yearId);
  fail(curErr, "os currículos");
  const curriculumId = new Map(
    (curriculaData ?? []).map((r) => [
      `${String(r["course_id"])}|${String(r["grade_level_id"])}`,
      String(r["id"]),
    ]),
  );
  const linkRows = plan.curriculum.flatMap((c) => {
    const program = programs.get(c.programCode);
    const grade = program ? grades.get(gradeKey(program.id, c.gradeCode)) : undefined;
    const id = program && grade ? curriculumId.get(`${program.id}|${grade.id}`) : undefined;
    if (!id) return [];
    return c.subjectCodes.flatMap((code, order) => {
      const sid = subjectId(code);
      return sid
        ? [
            {
              school_id: schoolId,
              curriculum_id: id,
              subject_id: sid,
              is_mandatory: true,
              display_order: order + 1,
              ...audit,
            },
          ]
        : [];
    });
  });
  if (linkRows.length) {
    const { error } = await db
      .from("curriculum_subjects")
      .upsert(linkRows, { onConflict: "curriculum_id,subject_id", ignoreDuplicates: true })
      .select("id");
    fail(error, "as disciplinas do currículo");
  }

  return { created, pendingWithoutYear: false };
}
