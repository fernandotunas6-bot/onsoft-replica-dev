import type { SupabaseClient } from "@supabase/supabase-js";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { calculateTrimesterAverage } from "@/lib/angola-academic";
import {
  DEFAULT_CALCULATION_OPTIONS,
  parseCalculationOptions,
  type NppMode,
} from "./assessment-model";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- remote SGA schema has no generated types
type Db = SupabaseClient<any>;

const COMPONENT_CODES = ["MAC", "NPP", "NPT"] as const;
type ComponentCode = (typeof COMPONENT_CODES)[number];

/**
 * Tipo de cada componente no diário, que decide como o motor oficial
 * (`private.compute_subject_averages`) o conta: `continuous` entra na média
 * contínua, `term_exam` na de exame, `informative` em nenhuma. Com o Decreto
 * 424/25, MT = (MAC + NPT) ÷ 2 e a NPP já está incluída no MAC. Migração
 * `20260929090000_pauta_component_kinds.sql`: antes os três eram
 * `continuous` e a pauta daria metade da média.
 */
export const PAUTA_COMPONENT_KINDS: Record<ComponentCode, string> = {
  MAC: "continuous",
  NPP: "informative",
  NPT: "term_exam",
};

/** Os tipos para a opção de NPP do modelo ("conta na parte contínua" → `continuous`). */
export function pautaComponentKinds(nppMode: NppMode): Record<ComponentCode, string> {
  return nppMode === "in_continuous"
    ? { ...PAUTA_COMPONENT_KINDS, NPP: "continuous" }
    : PAUTA_COMPONENT_KINDS;
}

/** Opção de NPP do modelo a que o diário pertence. */
async function gradebookNppMode(db: Db, schoolId: string, gradebookId: string): Promise<NppMode> {
  const { data: book } = await db
    .from("gradebooks")
    .select("rule_set_id")
    .eq("school_id", schoolId)
    .eq("id", gradebookId)
    .maybeSingle();
  if (!book?.rule_set_id) return DEFAULT_CALCULATION_OPTIONS.nppMode;
  const { data: rule } = await db
    .from("assessment_rule_sets")
    .select("formula")
    .eq("school_id", schoolId)
    .eq("id", book.rule_set_id)
    .maybeSingle();
  return parseCalculationOptions(rule?.formula).nppMode;
}

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
    // Até 2026-09-20 isto era um beco sem saída numa escola nova: `assessment_rule_sets`
    // não existia em produção, e as duas funções que a preencheriam
    // (`configure_assessment_rules`, `publish_assessment_rule_version`) falhavam com 42P01
    // pela mesma razão — sem `rule_set_id` não se abria o primeiro diário, logo não se
    // lançavam notas. A migração `20260924005124_assessment_rule_sets.sql` foi aplicada e
    // as funções passam a chegar à verificação de permissão (`assessment.rules.manage`).
    // Restam, portanto, dois casos distintos, e o segundo é accionável por quem o lê.
    throw new Error(
      ruleTableMissing
        ? "As regras de avaliação ainda não existem nesta base de dados. É preciso aplicar a migração 20260924005124_assessment_rule_sets.sql antes de abrir o primeiro diário de notas."
        : "A escola ainda não tem modelo de avaliação publicado. O Administrador publica-o em Pedagógica → Modelos de avaliação; só depois se gravam as notas da pauta.",
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
    .select("id, code, kind")
    .eq("gradebook_id", gradebookId);
  if (error) throw publicDatabaseError(error, "Não foi possível carregar os componentes de nota.");

  const byCode = new Map(
    (existing ?? []).map((row: { id: string; code: string; kind: string }) => [
      row.code.toUpperCase(),
      row,
    ]),
  );

  const kinds = pautaComponentKinds(await gradebookNppMode(db, schoolId, gradebookId));
  const ids = {} as Record<ComponentCode, string>;
  for (const [index, code] of COMPONENT_CODES.entries()) {
    const kind = kinds[code];
    const current = byCode.get(code);
    if (current) {
      ids[code] = current.id;
      // Diários antigos: corrigir o tipo para o motor contar certo.
      if (current.kind !== kind) {
        const { error: kindError } = await db
          .from("grade_items")
          .update({ kind })
          .eq("id", current.id)
          .eq("school_id", schoolId);
        if (kindError) {
          throw publicDatabaseError(kindError, `Não foi possível corrigir o componente ${code}.`);
        }
      }
      continue;
    }
    const { data: created, error: createError } = await db
      .from("grade_items")
      .insert({
        school_id: schoolId,
        gradebook_id: gradebookId,
        code,
        name: code,
        kind,
        weight: 1,
        max_score: 20,
        sequence: index + 1,
        created_by: userId,
      })
      .select("id")
      .single();
    if (createError) {
      throw publicDatabaseError(
        createError,
        `Não foi possível criar o componente ${code} no diário.`,
      );
    }
    ids[code] = created.id;
  }
  return ids;
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
    .select("id, score")
    .eq("grade_item_id", gradeItemId)
    .eq("enrollment_id", enrollmentId)
    .maybeSingle();
  if (error) throw publicDatabaseError(error, "Não foi possível verificar a nota.");

  if (existing?.id) {
    const previous = existing.score == null ? null : Number(existing.score);
    if (previous === score) return { id: existing.id, score };
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
    await recordScoreChanges(db, schoolId, userId, [
      { gradeScoreId: String(existing.id), previous, next: score },
    ]);
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
    average: calculateTrimesterAverage(mac, npt, npp),
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
    .select("id, enrollment_id, score")
    .eq("grade_item_id", gradeItemId)
    .in("enrollment_id", enrollmentIds);
  if (error) throw publicDatabaseError(error, "Não foi possível verificar as notas existentes.");

  const existingByEnrollment = new Map(
    (existing ?? []).map((row: { id: string; enrollment_id: string }) => [
      row.enrollment_id,
      row.id,
    ]),
  );
  const previousByEnrollment = new Map(
    (existing ?? []).map((row: { enrollment_id: string; score: number | null }) => [
      row.enrollment_id,
      row.score == null ? null : Number(row.score),
    ]),
  );
  const toInsert = entries.filter((entry) => !existingByEnrollment.has(entry.enrollmentId));
  // Só se regravam (e registam no histórico) as notas que mudaram mesmo.
  const toUpdate = entries.filter(
    (entry) =>
      existingByEnrollment.has(entry.enrollmentId) &&
      previousByEnrollment.get(entry.enrollmentId) !== entry.score,
  );

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
  await recordScoreChanges(
    db,
    schoolId,
    userId,
    toUpdate.map((entry) => ({
      gradeScoreId: existingByEnrollment.get(entry.enrollmentId)!,
      previous: previousByEnrollment.get(entry.enrollmentId) ?? null,
      next: entry.score,
    })),
  );
}

/**
 * Histórico de alterações (valor anterior → novo, quem). Sem a tabela
 * (migração 20260926160000 por aplicar) não falha o lançamento.
 */
async function recordScoreChanges(
  db: Db,
  schoolId: string,
  userId: string,
  changes: Array<{ gradeScoreId: string; previous: number | null; next: number }>,
) {
  if (!changes.length) return;
  const { error } = await db.from("grade_score_history").insert(
    changes.map((change) => ({
      school_id: schoolId,
      grade_score_id: change.gradeScoreId,
      previous_score: change.previous,
      new_score: change.next,
      reason: "Alteração no lançamento",
      actor_user_id: userId,
      kind: "change",
    })),
  );
  if (error && !/schema cache|does not exist|42P01|PGRST205/i.test(error.message)) {
    console.warn("[grade_score_history] não gravado:", error.message);
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

  // O servidor devolve no máximo 1000 linhas por pedido: ler por páginas,
  // senão as turmas cujas notas ficam depois da 1000ª aparecem sem média.
  const PAGE = 1000;
  const maxRows = Math.max(limit * 3, 300);
  const scores: Array<{
    id: string;
    grade_item_id: string;
    enrollment_id: string;
    score: number | null;
    status: string | null;
    updated_at: string | null;
  }> = [];
  for (let from = 0; from < maxRows; from += PAGE) {
    let scoresQuery = db
      .from("grade_scores")
      .select("id, grade_item_id, enrollment_id, score, status, updated_at")
      .eq("school_id", schoolId)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, Math.min(from + PAGE, maxRows) - 1);
    if (enrollmentIds?.length) scoresQuery = scoresQuery.in("enrollment_id", enrollmentIds);
    const { data: page, error } = await scoresQuery;
    if (error) {
      if (/schema cache|does not exist|42P01|PGRST/i.test(error.message)) return [];
      throw publicDatabaseError(error, "Não foi possível carregar as notas.");
    }
    scores.push(...((page ?? []) as typeof scores));
    if (!page || page.length < PAGE) break;
  }
  if (!scores.length) return [];

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
