import type { ImportRefCache, RowImporter } from "../engine/types";
import {
  loadStudentRefs,
  loadSubjectRefs,
  parseScore,
  parseTerm,
  resolveStudent,
  resolveSubject,
  studentIdentifierOf,
  type StudentRef,
  type SubjectRef,
} from "./academic-core";

type EnrollmentRef = { id: string; student_id: string; class_group_id: string; academic_year_id: string; status: string };
type AssignmentRef = { id: string; class_group_id: string; subject_id: string; teacher_id: string | null };
type TermRef = { id: string; sequence: number };
type GradebookRef = { id: string; term_id: string; class_subject_id: string; class_group_id: string };
type ItemRef = { id: string; gradebook_id: string; code: string };
type ScoreRef = { id: string; grade_item_id: string; enrollment_id: string; score: number | null; status: string };

type NotasCache = ImportRefCache & {
  academicYearId: string | null;
  students: StudentRef[];
  subjects: SubjectRef[];
  enrollmentByStudent: Map<string, EnrollmentRef>;
  assignmentByPair: Map<string, AssignmentRef>;
  termBySequence: Map<number, TermRef>;
  gradebookByContext: Map<string, GradebookRef>;
  itemsByGradebook: Map<string, Map<string, ItemRef>>;
  scoreByItemEnrollment: Map<string, ScoreRef>;
};

function pairKey(classGroupId: string, subjectId: string) {
  return `${classGroupId}:${subjectId}`;
}
function gradebookKey(termId: string, classSubjectId: string) {
  return `${termId}:${classSubjectId}`;
}
function scoreKey(itemId: string, enrollmentId: string) {
  return `${itemId}:${enrollmentId}`;
}
function subjectValue(row: Record<string, unknown>) {
  return row["subject"] ?? row["disciplina"] ?? row["Disciplina"];
}
function scoreValues(row: Record<string, unknown>) {
  return {
    MAC: parseScore(row["mac"] ?? row["MAC"]),
    NPP: parseScore(row["npp"] ?? row["NPP"]),
    NPT: parseScore(row["npt"] ?? row["NPT"]),
  } as const;
}

function resolveContext(normalized: Record<string, unknown>, cache: NotasCache) {
  const student = resolveStudent(studentIdentifierOf(normalized), cache.students);
  const subject = resolveSubject(subjectValue(normalized), cache.subjects);
  const term = parseTerm(normalized["term"] ?? normalized["periodo"] ?? normalized["Período"]);
  const enrollment = student.row ? cache.enrollmentByStudent.get(student.row.id) ?? null : null;
  const assignment = enrollment && subject.row
    ? cache.assignmentByPair.get(pairKey(enrollment.class_group_id, subject.row.id)) ?? null
    : null;
  const termRef = term ? cache.termBySequence.get(term) ?? null : null;
  const gradebook = assignment && termRef
    ? cache.gradebookByContext.get(gradebookKey(termRef.id, assignment.id)) ?? null
    : null;
  const items = gradebook ? cache.itemsByGradebook.get(gradebook.id) ?? null : null;
  return { student, subject, term, enrollment, assignment, termRef, gradebook, items };
}

export const notasImporter: RowImporter = {
  module: "notas",

  async loadRefCache(ctx) {
    const [students, subjects, enrollmentsResult, termsResult, assignmentsResult] = await Promise.all([
      loadStudentRefs(ctx.db, ctx.schoolId),
      loadSubjectRefs(ctx.db, ctx.schoolId),
      ctx.academicYearId
        ? ctx.db.from("enrollments").select("id, student_id, class_group_id, academic_year_id, status").eq("school_id", ctx.schoolId).eq("academic_year_id", ctx.academicYearId).in("status", ["active", "pending"])
        : Promise.resolve({ data: [], error: null }),
      ctx.academicYearId
        ? ctx.db.from("terms").select("id, sequence").eq("school_id", ctx.schoolId).eq("academic_year_id", ctx.academicYearId)
        : Promise.resolve({ data: [], error: null }),
      ctx.db.from("class_subjects").select("id, class_group_id, subject_id, teacher_id, status").eq("school_id", ctx.schoolId).eq("status", "active"),
    ]);
    if (enrollmentsResult.error) throw new Error(`Não foi possível carregar matrículas: ${enrollmentsResult.error.message}`);
    if (termsResult.error) throw new Error(`Não foi possível carregar períodos: ${termsResult.error.message}`);
    if (assignmentsResult.error) throw new Error(`Não foi possível carregar atribuições de disciplinas: ${assignmentsResult.error.message}`);

    const enrollments = (enrollmentsResult.data ?? []).map((row) => ({ id: String(row.id), student_id: String(row.student_id), class_group_id: String(row.class_group_id), academic_year_id: String(row.academic_year_id), status: String(row.status) }));
    const classGroupIds = [...new Set(enrollments.map((row) => row.class_group_id))];
    const assignments = (assignmentsResult.data ?? [])
      .filter((row) => classGroupIds.includes(String(row.class_group_id)))
      .map((row) => ({ id: String(row.id), class_group_id: String(row.class_group_id), subject_id: String(row.subject_id), teacher_id: row.teacher_id ? String(row.teacher_id) : null }));
    const classSubjectIds = assignments.map((row) => row.id);
    const gradebooksResult = classSubjectIds.length && ctx.academicYearId
      ? await ctx.db.from("gradebooks").select("id, term_id, class_subject_id, class_group_id").eq("school_id", ctx.schoolId).eq("academic_year_id", ctx.academicYearId).in("class_subject_id", classSubjectIds)
      : { data: [], error: null };
    if (gradebooksResult.error) throw new Error(`Não foi possível carregar diários de notas: ${gradebooksResult.error.message}`);
    const gradebooks = (gradebooksResult.data ?? []).map((row) => ({ id: String(row.id), term_id: String(row.term_id), class_subject_id: String(row.class_subject_id), class_group_id: String(row.class_group_id) }));
    const gradebookIds = gradebooks.map((row) => row.id);
    const itemsResult = gradebookIds.length
      ? await ctx.db.from("grade_items").select("id, gradebook_id, code").eq("school_id", ctx.schoolId).in("gradebook_id", gradebookIds)
      : { data: [], error: null };
    if (itemsResult.error) throw new Error(`Não foi possível carregar componentes MAC/NPP/NPT: ${itemsResult.error.message}`);
    const items = (itemsResult.data ?? []).map((row) => ({ id: String(row.id), gradebook_id: String(row.gradebook_id), code: String(row.code ?? "").toUpperCase() }));
    const itemIds = items.map((row) => row.id);
    const enrollmentIds = enrollments.map((row) => row.id);
    const scoresResult = itemIds.length && enrollmentIds.length
      ? await ctx.db.from("grade_scores").select("id, grade_item_id, enrollment_id, score, status").eq("school_id", ctx.schoolId).in("grade_item_id", itemIds).in("enrollment_id", enrollmentIds)
      : { data: [], error: null };
    if (scoresResult.error) throw new Error(`Não foi possível carregar notas existentes: ${scoresResult.error.message}`);

    const itemsByGradebook = new Map<string, Map<string, ItemRef>>();
    for (const item of items) {
      const map = itemsByGradebook.get(item.gradebook_id) ?? new Map<string, ItemRef>();
      map.set(item.code, item);
      itemsByGradebook.set(item.gradebook_id, map);
    }

    return {
      existingPeople: [],
      classGroups: [],
      studentByPersonId: new Map(),
      academicYearId: ctx.academicYearId,
      students,
      subjects,
      enrollmentByStudent: new Map(enrollments.map((row) => [row.student_id, row])),
      assignmentByPair: new Map(assignments.map((row) => [pairKey(row.class_group_id, row.subject_id), row])),
      termBySequence: new Map((termsResult.data ?? []).map((row) => [Number(row.sequence), { id: String(row.id), sequence: Number(row.sequence) }])),
      gradebookByContext: new Map(gradebooks.map((row) => [gradebookKey(row.term_id, row.class_subject_id), row])),
      itemsByGradebook,
      scoreByItemEnrollment: new Map((scoresResult.data ?? []).map((row) => {
        const ref: ScoreRef = { id: String(row.id), grade_item_id: String(row.grade_item_id), enrollment_id: String(row.enrollment_id), score: row.score == null ? null : Number(row.score), status: String(row.status ?? "draft") };
        return [scoreKey(ref.grade_item_id, ref.enrollment_id), ref];
      })),
    } as NotasCache;
  },

  analyzeRow(normalized, rawCache) {
    const cache = rawCache as NotasCache;
    const errors: string[] = [];
    if (!cache.academicYearId) errors.push("Seleccione o ano lectivo antes de importar notas.");
    const identifier = studentIdentifierOf(normalized);
    const context = resolveContext(normalized, cache);
    if (!identifier) errors.push("Processo ou BI do aluno é obrigatório.");
    if (context.student.ambiguous) errors.push(`Identificador "${identifier}" é ambíguo; use o nº de processo exacto.`);
    else if (identifier && !context.student.row) errors.push(`Aluno "${identifier}" não encontrado nesta escola.`);
    if (!context.subject.row) errors.push(`Disciplina "${String(subjectValue(normalized) ?? "")}" não encontrada de forma exacta nesta escola.`);
    if (!context.term) errors.push("Período inválido. Use 1º, 2º ou 3º Trimestre.");
    if (context.student.row && !context.enrollment) errors.push("O aluno não possui matrícula activa no ano lectivo seleccionado.");
    if (context.enrollment && context.subject.row && !context.assignment) errors.push("A disciplina não está atribuída à turma deste aluno.");
    if (context.assignment && !context.assignment.teacher_id) errors.push("A disciplina da turma ainda não tem professor atribuído.");
    if (context.term && !context.termRef) errors.push(`O ${context.term}º período ainda não está configurado neste ano lectivo.`);
    if (context.assignment && context.termRef && !context.gradebook) errors.push("O diário de notas desta turma/disciplina/período ainda não foi preparado. Abra o diário antes da importação.");
    if (context.gradebook) {
      for (const code of ["MAC", "NPP", "NPT"] as const) {
        if (!context.items?.get(code)) errors.push(`Componente ${code} não existe no diário seleccionado.`);
      }
    }
    const scores = scoreValues(normalized);
    for (const code of ["MAC", "NPP", "NPT"] as const) {
      if (scores[code] === null) errors.push(`${code} é obrigatório e deve estar entre 0 e 20.`);
    }
    if (errors.length) return { status: "error", warnings: [], errors };
    const hasExisting = (["MAC", "NPP", "NPT"] as const).some((code) => {
      const item = context.items!.get(code)!;
      return cache.scoreByItemEnrollment.has(scoreKey(item.id, context.enrollment!.id));
    });
    return hasExisting
      ? { status: "duplicate", warnings: ["Já existem notas neste diário; a estratégia update substituirá apenas MAC/NPP/NPT desta linha."], errors: [], duplicate_of: context.enrollment!.id }
      : { status: "valid", warnings: [], errors: [] };
  },

  async commitRow(normalized, ctx, rawCache) {
    const cache = rawCache as NotasCache;
    const analysis = this.analyzeRow(normalized, rawCache);
    if (analysis.status === "error") return { status: "error", warnings: [], errors: analysis.errors, audits: [] };
    const context = resolveContext(normalized, cache);
    const scores = scoreValues(normalized);
    const existing = (["MAC", "NPP", "NPT"] as const).map((code) => {
      const item = context.items!.get(code)!;
      return cache.scoreByItemEnrollment.get(scoreKey(item.id, context.enrollment!.id)) ?? null;
    });
    if (existing.some(Boolean) && ctx.duplicateStrategy === "ignore") {
      return { status: "ignored", target_record_id: context.enrollment!.id, warnings: ["Notas existentes ignoradas."], errors: [], audits: [] };
    }
    if (ctx.duplicateStrategy === "create_new" && existing.some(Boolean)) {
      return { status: "error", target_record_id: context.enrollment!.id, warnings: [], errors: ["Não é permitido criar uma segunda nota para o mesmo aluno/componente no mesmo diário."], audits: [] };
    }
    if (ctx.dryRun) {
      return { status: existing.some(Boolean) ? "will_update" : "will_insert", target_record_id: context.enrollment!.id, warnings: [], errors: [], audits: [] };
    }

    const audits = [] as Array<{ table_name: string; target_id: string; action_type: "inserted" | "updated"; before_data?: Record<string, unknown>; after_data?: Record<string, unknown> }>;
    let firstId: string | null = null;
    for (const code of ["MAC", "NPP", "NPT"] as const) {
      const item = context.items!.get(code)!;
      const key = scoreKey(item.id, context.enrollment!.id);
      const old = cache.scoreByItemEnrollment.get(key);
      if (old) {
        const before = { ...old };
        const patch = { score: scores[code]!, status: "draft", updated_by: ctx.userId };
        const { data: updated, error } = await ctx.db.from("grade_scores").update(patch).eq("id", old.id).eq("school_id", ctx.schoolId).eq("grade_item_id", item.id).eq("enrollment_id", context.enrollment!.id).select("id, score, status").single();
        if (error || !updated) return { status: "error", warnings: [], errors: [`Falha ao actualizar ${code}: ${error?.message ?? "registo não encontrado"}`], audits };
        old.score = Number(updated.score);
        old.status = String(updated.status ?? "draft");
        firstId ??= old.id;
        audits.push({ table_name: "grade_scores", target_id: old.id, action_type: "updated", before_data: before, after_data: { ...old } });
      } else {
        const { data: created, error } = await ctx.db.from("grade_scores").insert({ school_id: ctx.schoolId, grade_item_id: item.id, enrollment_id: context.enrollment!.id, score: scores[code]!, status: "draft", recorded_by: ctx.userId, updated_by: ctx.userId }).select("id, score, status").single();
        if (error || !created) return { status: "error", warnings: [], errors: [`Falha ao inserir ${code}: ${error?.message ?? "erro desconhecido"}`], audits };
        const ref: ScoreRef = { id: String(created.id), grade_item_id: item.id, enrollment_id: context.enrollment!.id, score: Number(created.score), status: String(created.status ?? "draft") };
        cache.scoreByItemEnrollment.set(key, ref);
        firstId ??= ref.id;
        audits.push({ table_name: "grade_scores", target_id: ref.id, action_type: "inserted", after_data: { ...ref } });
      }
    }
    return { status: "imported", target_record_id: firstId, warnings: [], errors: [], audits };
  },
};
