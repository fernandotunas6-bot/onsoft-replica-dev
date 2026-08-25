import type { SupabaseClient } from "@supabase/supabase-js";
import { publicDatabaseError } from "@/integrations/supabase/server-error";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- remote SGA schema has no generated types
type Db = SupabaseClient<any>;

const COMPONENT_CODES = ["MAC", "NPP", "NPT"] as const;
type ComponentCode = (typeof COMPONENT_CODES)[number];

async function ensureTerm(db: Db, schoolId: string, academicYearId: string, term: number) {
  const { data: existing, error } = await db
    .from("terms")
    .select("id, sequence, name")
    .eq("school_id", schoolId)
    .eq("academic_year_id", academicYearId)
    .eq("sequence", term)
    .maybeSingle();
  if (error) throw publicDatabaseError(error, "Não foi possível carregar o trimestre.");
  if (existing?.id) return existing;

  const { data: created, error: createError } = await db
    .from("terms")
    .insert({
      school_id: schoolId,
      academic_year_id: academicYearId,
      name: `${term}º Trimestre`,
      sequence: term,
      starts_on: term === 1 ? "2026-09-01" : term === 2 ? "2027-01-05" : "2027-04-01",
      ends_on: term === 1 ? "2026-12-15" : term === 2 ? "2027-03-20" : "2027-07-15",
    })
    .select("id, sequence, name")
    .single();
  if (createError) throw publicDatabaseError(createError, "Não foi possível criar o trimestre.");
  return created;
}

export async function ensureDefaultTeacher(db: Db, schoolId: string, _userId: string) {
  const { data: existing, error } = await db
    .from("teachers")
    .select("id")
    .eq("school_id", schoolId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (error) throw publicDatabaseError(error, "Não foi possível carregar professores.");
  if (existing?.id) return existing.id as string;

  throw new Error(
    "Nenhum professor activo cadastrado na instituição. Cadastre um docente no módulo Pessoas primeiro.",
  );
}

async function ensureClassSubject(
  db: Db,
  schoolId: string,
  classGroupId: string,
  subjectId: string,
  userId: string,
) {
  const { data: existing, error } = await db
    .from("class_subjects")
    .select("id")
    .eq("class_group_id", classGroupId)
    .eq("subject_id", subjectId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw publicDatabaseError(error, "Não foi possível associar a disciplina.");
  if (existing?.id) return existing.id;

  const teacherId = await ensureDefaultTeacher(db, schoolId, userId);
  const { data: created, error: createError } = await db
    .from("class_subjects")
    .insert({
      school_id: schoolId,
      class_group_id: classGroupId,
      subject_id: subjectId,
      teacher_id: teacherId,
      weekly_periods: 1,
      status: "active",
      created_by: userId,
      updated_by: userId,
    })
    .select("id")
    .single();
  if (createError) {
    throw publicDatabaseError(createError, "Não foi possível associar a disciplina à turma.");
  }
  return created.id as string;
}

async function ensureGradebook(
  db: Db,
  schoolId: string,
  academicYearId: string,
  termId: string,
  classGroupId: string,
  classSubjectId: string,
  userId: string,
) {
  const { data: existing, error } = await db
    .from("gradebooks")
    .select("id")
    .eq("school_id", schoolId)
    .eq("term_id", termId)
    .eq("class_subject_id", classSubjectId)
    .eq("class_group_id", classGroupId)
    .maybeSingle();
  if (error) throw publicDatabaseError(error, "Não foi possível carregar o diário de classe.");
  if (existing?.id) return existing.id as string;

  let ruleSetId: string | null = null;
  const { data: ruleSet, error: ruleError } = await db
    .from("assessment_rule_sets")
    .select("id")
    .eq("school_id", schoolId)
    .eq("status", "active")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const ruleTableMissing =
    !!ruleError &&
    /schema cache|does not exist|assessment_rule_sets|42P01|PGRST/i.test(ruleError.message);

  if (ruleError && !ruleTableMissing) {
    throw publicDatabaseError(ruleError, "Não foi possível carregar as regras de avaliação.");
  }
  if (ruleSet?.id) {
    ruleSetId = ruleSet.id as string;
  } else {
    // SGA demo: tabela assessment_rule_sets pode não estar exposta; reutilizar rule_set_id
    // já presente noutro diário da escola.
    const { data: donor, error: donorError } = await db
      .from("gradebooks")
      .select("rule_set_id")
      .eq("school_id", schoolId)
      .not("rule_set_id", "is", null)
      .limit(1)
      .maybeSingle();
    if (donorError) {
      throw publicDatabaseError(donorError, "Não foi possível reutilizar regras de avaliação.");
    }
    ruleSetId = (donor?.rule_set_id as string | null) ?? null;
  }

  if (!ruleSetId) {
    throw new Error(
      "Não há regras de avaliação (assessment_rule_sets / rule_set_id) nesta escola. Configure-as no SGA antes de lançar notas.",
    );
  }

  const { data: created, error: createError } = await db
    .from("gradebooks")
    .insert({
      school_id: schoolId,
      academic_year_id: academicYearId,
      term_id: termId,
      class_subject_id: classSubjectId,
      class_group_id: classGroupId,
      rule_set_id: ruleSetId,
      status: "open",
      opened_at: new Date().toISOString(),
      created_by: userId,
      updated_by: userId,
    })
    .select("id")
    .single();
  if (createError)
    throw publicDatabaseError(createError, "Não foi possível abrir o diário de notas.");
  return created.id as string;
}

async function ensureComponentItems(db: Db, schoolId: string, gradebookId: string, userId: string) {
  const { data: existing, error } = await db
    .from("grade_items")
    .select("id, code")
    .eq("gradebook_id", gradebookId);
  if (error) throw publicDatabaseError(error, "Não foi possível carregar os componentes de nota.");

  const byCode = new Map(
    (existing ?? []).map((row: { id: string; code: string }) => [row.code.toUpperCase(), row.id]),
  );

  for (const [index, code] of COMPONENT_CODES.entries()) {
    if (byCode.has(code)) continue;
    const { data: created, error: createError } = await db
      .from("grade_items")
      .insert({
        school_id: schoolId,
        gradebook_id: gradebookId,
        code,
        name: code,
        kind: "score",
        weight: 1,
        max_score: 20,
        sequence: index + 1,
        created_by: userId,
      })
      .select("id, code")
      .single();
    if (createError) {
      // Alguns SGA usam kind diferente; tenta continuous.
      const { data: retry, error: retryError } = await db
        .from("grade_items")
        .insert({
          school_id: schoolId,
          gradebook_id: gradebookId,
          code,
          name: code,
          kind: "continuous",
          weight: 1,
          max_score: 20,
          sequence: index + 1,
          created_by: userId,
        })
        .select("id, code")
        .single();
      if (retryError) {
        throw publicDatabaseError(
          createError,
          `Não foi possível criar o componente ${code} no diário.`,
        );
      }
      byCode.set(code, retry.id);
    } else {
      byCode.set(code, created.id);
    }
  }

  return {
    MAC: byCode.get("MAC")!,
    NPP: byCode.get("NPP")!,
    NPT: byCode.get("NPT")!,
  } as Record<ComponentCode, string>;
}

async function upsertScore(
  db: Db,
  schoolId: string,
  gradeItemId: string,
  enrollmentId: string,
  score: number,
  userId: string,
) {
  const { data: existing, error } = await db
    .from("grade_scores")
    .select("id")
    .eq("grade_item_id", gradeItemId)
    .eq("enrollment_id", enrollmentId)
    .maybeSingle();
  if (error) throw publicDatabaseError(error, "Não foi possível verificar a nota.");

  if (existing?.id) {
    const { data: updated, error: updateError } = await db
      .from("grade_scores")
      .update({
        score,
        status: "draft",
        updated_by: userId,
      })
      .eq("id", existing.id)
      .select("id, score")
      .single();
    if (updateError) throw publicDatabaseError(updateError, "Não foi possível actualizar a nota.");
    return updated;
  }

  const { data: created, error: createError } = await db
    .from("grade_scores")
    .insert({
      school_id: schoolId,
      grade_item_id: gradeItemId,
      enrollment_id: enrollmentId,
      score,
      status: "draft",
      recorded_by: userId,
      updated_by: userId,
    })
    .select("id, score")
    .single();
  if (createError) throw publicDatabaseError(createError, "Não foi possível lançar a nota.");
  return created;
}

export async function upsertSgaTermGrade(params: {
  db: Db;
  schoolId: string;
  userId: string;
  enrollmentId: string;
  subjectId: string;
  term: number;
  mac: number;
  npp: number;
  npt: number;
}) {
  const { db, schoolId, userId, enrollmentId, subjectId, term, mac, npp, npt } = params;

  const { data: enrollment, error: enrollmentError } = await db
    .from("enrollments")
    .select("id, class_group_id, academic_year_id, student_id, status")
    .eq("id", enrollmentId)
    .eq("school_id", schoolId)
    .maybeSingle();
  if (enrollmentError) {
    throw publicDatabaseError(enrollmentError, "Não foi possível validar a matrícula.");
  }
  if (!enrollment?.class_group_id || !enrollment.academic_year_id) {
    throw new Error("A matrícula precisa de turma e ano lectivo para lançar notas.");
  }

  const termRow = await ensureTerm(db, schoolId, enrollment.academic_year_id, term);
  const classSubjectId = await ensureClassSubject(
    db,
    schoolId,
    enrollment.class_group_id,
    subjectId,
    userId,
  );
  const gradebookId = await ensureGradebook(
    db,
    schoolId,
    enrollment.academic_year_id,
    termRow.id,
    enrollment.class_group_id,
    classSubjectId,
    userId,
  );
  const items = await ensureComponentItems(db, schoolId, gradebookId, userId);

  await Promise.all([
    upsertScore(db, schoolId, items.MAC, enrollmentId, mac, userId),
    upsertScore(db, schoolId, items.NPP, enrollmentId, npp, userId),
    upsertScore(db, schoolId, items.NPT, enrollmentId, npt, userId),
  ]);

  return {
    enrollment_id: enrollmentId,
    subject_id: subjectId,
    term,
    mac,
    npp,
    npt,
    average: (mac + npp + npt) / 3,
    gradebook_id: gradebookId,
  };
}

async function ensureGradeContext(params: {
  db: Db;
  schoolId: string;
  userId: string;
  academicYearId: string;
  classGroupId: string;
  subjectId: string;
  term: number;
}) {
  const { db, schoolId, userId, academicYearId, classGroupId, subjectId, term } = params;
  const termRow = await ensureTerm(db, schoolId, academicYearId, term);
  const classSubjectId = await ensureClassSubject(db, schoolId, classGroupId, subjectId, userId);
  const gradebookId = await ensureGradebook(
    db,
    schoolId,
    academicYearId,
    termRow.id,
    classGroupId,
    classSubjectId,
    userId,
  );
  const items = await ensureComponentItems(db, schoolId, gradebookId, userId);
  return { gradebookId, items };
}

/**
 * Grava as notas de um componente (MAC/NPP/NPT) para vários alunos com apenas 1
 * SELECT (existentes) + 1 INSERT em lote (novos) + updates em paralelo — substitui
 * o padrão anterior de 1 SELECT + 1 INSERT/UPDATE por aluno, que tornava o
 * lançamento de uma turma inteira em dezenas de idas e vindas sequenciais à base.
 */
async function upsertScoresBatch(
  db: Db,
  schoolId: string,
  gradeItemId: string,
  entries: Array<{ enrollmentId: string; score: number }>,
  userId: string,
) {
  if (!entries.length) return;
  const enrollmentIds = entries.map((entry) => entry.enrollmentId);
  const { data: existing, error } = await db
    .from("grade_scores")
    .select("id, enrollment_id")
    .eq("grade_item_id", gradeItemId)
    .in("enrollment_id", enrollmentIds);
  if (error) throw publicDatabaseError(error, "Não foi possível verificar as notas existentes.");

  const existingByEnrollment = new Map(
    (existing ?? []).map((row: { id: string; enrollment_id: string }) => [
      row.enrollment_id,
      row.id,
    ]),
  );
  const toInsert = entries.filter((entry) => !existingByEnrollment.has(entry.enrollmentId));
  const toUpdate = entries.filter((entry) => existingByEnrollment.has(entry.enrollmentId));

  const [insertResult, ...updateResults] = await Promise.all([
    toInsert.length
      ? db.from("grade_scores").insert(
          toInsert.map((entry) => ({
            school_id: schoolId,
            grade_item_id: gradeItemId,
            enrollment_id: entry.enrollmentId,
            score: entry.score,
            status: "draft",
            recorded_by: userId,
            updated_by: userId,
          })),
        )
      : Promise.resolve({ error: null }),
    ...toUpdate.map((entry) =>
      db
        .from("grade_scores")
        .update({ score: entry.score, status: "draft", updated_by: userId })
        .eq("id", existingByEnrollment.get(entry.enrollmentId)!),
    ),
  ]);
  if (insertResult.error) {
    throw publicDatabaseError(insertResult.error, "Não foi possível lançar as notas.");
  }
  for (const result of updateResults) {
    if (result.error)
      throw publicDatabaseError(result.error, "Não foi possível actualizar as notas.");
  }
}

export async function upsertSgaTermGradesBatch(params: {
  db: Db;
  schoolId: string;
  userId: string;
  subjectId: string;
  term: number;
  rows: Array<{ enrollmentId: string; mac: number; npp: number; npt: number }>;
}) {
  const { db, schoolId, userId, subjectId, term, rows } = params;
  if (!rows.length) return { saved: 0 };

  const enrollmentIds = [...new Set(rows.map((row) => row.enrollmentId))];
  const { data: enrollments, error: enrollmentsError } = await db
    .from("enrollments")
    .select("id, class_group_id, academic_year_id")
    .in("id", enrollmentIds)
    .eq("school_id", schoolId);
  if (enrollmentsError) {
    throw publicDatabaseError(enrollmentsError, "Não foi possível validar as matrículas.");
  }
  const enrollmentById = new Map(
    (enrollments ?? []).map(
      (row: { id: string; class_group_id: string | null; academic_year_id: string | null }) => [
        row.id,
        row,
      ],
    ),
  );

  // Notas de uma pauta pertencem, em regra, à mesma turma/ano lectivo — mas agrupa por
  // (turma, ano) em vez de assumir isso, para continuar correcto caso um lote misture
  // matrículas de turmas diferentes.
  const groups = new Map<
    string,
    { classGroupId: string; academicYearId: string; rows: typeof rows }
  >();
  for (const row of rows) {
    const enrollment = enrollmentById.get(row.enrollmentId);
    if (!enrollment?.class_group_id || !enrollment.academic_year_id) {
      throw new Error("A matrícula precisa de turma e ano lectivo para lançar notas.");
    }
    const key = `${enrollment.class_group_id}:${enrollment.academic_year_id}`;
    const group = groups.get(key) ?? {
      classGroupId: enrollment.class_group_id,
      academicYearId: enrollment.academic_year_id,
      rows: [],
    };
    group.rows.push(row);
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    const { items } = await ensureGradeContext({
      db,
      schoolId,
      userId,
      academicYearId: group.academicYearId,
      classGroupId: group.classGroupId,
      subjectId,
      term,
    });
    await Promise.all([
      upsertScoresBatch(
        db,
        schoolId,
        items.MAC,
        group.rows.map((row) => ({ enrollmentId: row.enrollmentId, score: row.mac })),
        userId,
      ),
      upsertScoresBatch(
        db,
        schoolId,
        items.NPP,
        group.rows.map((row) => ({ enrollmentId: row.enrollmentId, score: row.npp })),
        userId,
      ),
      upsertScoresBatch(
        db,
        schoolId,
        items.NPT,
        group.rows.map((row) => ({ enrollmentId: row.enrollmentId, score: row.npt })),
        userId,
      ),
    ]);
  }

  return { saved: rows.length };
}

export async function listSgaTermGrades(params: {
  db: Db;
  schoolId: string;
  enrollmentIds?: string[];
  limit?: number;
}) {
  const { db, schoolId, enrollmentIds, limit = 200 } = params;
  if (enrollmentIds && enrollmentIds.length === 0) return [];

  let scoresQuery = db
    .from("grade_scores")
    .select("id, grade_item_id, enrollment_id, score, status, updated_at")
    .eq("school_id", schoolId)
    .neq("status", "reversed")
    .order("updated_at", { ascending: false })
    .limit(Math.max(limit * 3, 300));
  if (enrollmentIds?.length) scoresQuery = scoresQuery.in("enrollment_id", enrollmentIds);

  const { data: scores, error } = await scoresQuery;
  if (error) {
    if (/schema cache|does not exist|42P01|PGRST/i.test(error.message)) return [];
    throw publicDatabaseError(error, "Não foi possível carregar as notas.");
  }
  if (!scores?.length) return [];

  const itemIds = [...new Set(scores.map((row: { grade_item_id: string }) => row.grade_item_id))];
  const { data: items, error: itemsError } = await db
    .from("grade_items")
    .select("id, code, gradebook_id")
    .in("id", itemIds);
  if (itemsError)
    throw publicDatabaseError(itemsError, "Não foi possível carregar os componentes.");

  const gradebookIds = [
    ...new Set((items ?? []).map((row: { gradebook_id: string }) => row.gradebook_id)),
  ];
  const { data: gradebooks } = gradebookIds.length
    ? await db
        .from("gradebooks")
        .select("id, term_id, class_subject_id, class_group_id")
        .in("id", gradebookIds)
    : { data: [] as Array<Record<string, unknown>> };

  const termIds = [
    ...new Set(
      ((gradebooks ?? []) as Array<Record<string, unknown>>)
        .map((row) => String(row["term_id"] ?? ""))
        .filter(Boolean),
    ),
  ];
  const classSubjectIds = [
    ...new Set(
      ((gradebooks ?? []) as Array<Record<string, unknown>>)
        .map((row) => String(row["class_subject_id"] ?? ""))
        .filter(Boolean),
    ),
  ];

  const [{ data: terms }, { data: classSubjects }] = await Promise.all([
    termIds.length
      ? db.from("terms").select("id, sequence, name").in("id", termIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    classSubjectIds.length
      ? db.from("class_subjects").select("id, subject_id, class_group_id").in("id", classSubjectIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
  ]);

  const toRecordMap = (rows: Array<Record<string, unknown>>) =>
    new Map(rows.map((row) => [String(row["id"] ?? ""), row] as const));
  const itemById = toRecordMap((items ?? []) as Array<Record<string, unknown>>);
  const gradebookById = toRecordMap((gradebooks ?? []) as Array<Record<string, unknown>>);
  const termById = toRecordMap((terms ?? []) as Array<Record<string, unknown>>);
  const classSubjectById = toRecordMap((classSubjects ?? []) as Array<Record<string, unknown>>);

  type Acc = {
    enrollment_id: string;
    subject_id: string;
    class_group_id: string | null;
    term: number;
    mac: number;
    npp: number;
    npt: number;
    updated_at: string;
    id: string;
  };
  const grouped = new Map<string, Acc>();

  for (const score of scores) {
    const item = itemById.get(score.grade_item_id);
    if (!item) continue;
    const gradebook = gradebookById.get(String(item["gradebook_id"]));
    if (!gradebook) continue;
    const classSubject = classSubjectById.get(String(gradebook["class_subject_id"]));
    const term = termById.get(String(gradebook["term_id"]));
    const subjectId = String(classSubject?.["subject_id"] ?? "");
    const termNumber = Number(term?.["sequence"] ?? 0);
    if (!subjectId || !termNumber) continue;
    const key = `${score.enrollment_id}:${subjectId}:${termNumber}`;
    const current = grouped.get(key) ?? {
      enrollment_id: String(score.enrollment_id),
      subject_id: subjectId,
      class_group_id: (gradebook["class_group_id"] as string | null) ?? null,
      term: termNumber,
      mac: 0,
      npp: 0,
      npt: 0,
      updated_at: String(score.updated_at ?? ""),
      id: key,
    };
    const code = String(item["code"] ?? "").toUpperCase();
    const value = Number(score.score ?? 0);
    if (code === "MAC") current.mac = value;
    if (code === "NPP") current.npp = value;
    if (code === "NPT") current.npt = value;
    if (String(score.updated_at ?? "") > current.updated_at) {
      current.updated_at = String(score.updated_at ?? "");
    }
    grouped.set(key, current);
  }

  return [...grouped.values()].slice(0, limit);
}
