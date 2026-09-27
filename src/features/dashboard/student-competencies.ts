/**
 * Competências do aluno no portal (o Aluno a si próprio, o Encarregado um
 * educando ligado). Matrícula activa, disciplinas da turma, competências de
 * cada disciplina e o domínio calculado com as notas deste aluno apenas.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computeMastery } from "@/features/academic/competency-mastery";
import { loadActiveRuleSummary } from "@/features/academic/exam-data";
import { resolveVisibleStudent } from "./student-access";

type Row = Record<string, unknown>;
const str = (v: unknown) => (v == null ? "" : String(v));

export type StudentCompetencySubject = {
  subjectId: string;
  subjectName: string;
  assessed: number;
  mastered: number;
  competencies: Array<{
    id: string;
    code: string;
    description: string;
    mastered: boolean | null;
  }>;
};

export type StudentCompetencies = {
  passing: number;
  subjects: StudentCompetencySubject[];
};

const EMPTY: StudentCompetencies = { passing: 10, subjects: [] };

export const getMyStudentCompetencies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ studentId: z.string().uuid().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<StudentCompetencies> => {
    const visible = await resolveVisibleStudent(context.userId, data.studentId);
    if (!visible) return EMPTY;
    const { db, schoolId, studentId } = visible;

    const { data: enrollment } = await db
      .from("enrollments")
      .select("id, class_group_id")
      .eq("school_id", schoolId)
      .eq("student_id", studentId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!enrollment?.class_group_id) return EMPTY;
    const classGroupId = str(enrollment.class_group_id);
    const enrollmentId = str(enrollment.id);

    const [{ data: group }, { data: classSubjects }] = await Promise.all([
      db
        .from("class_groups")
        .select("grade_level_id")
        .eq("school_id", schoolId)
        .eq("id", classGroupId)
        .maybeSingle(),
      db
        .from("class_subjects")
        .select("subject_id")
        .eq("school_id", schoolId)
        .eq("class_group_id", classGroupId)
        .eq("status", "active"),
    ]);
    const subjectIds = [...new Set(((classSubjects ?? []) as Row[]).map((c) => str(c.subject_id)))];
    if (!subjectIds.length) return EMPTY;
    const gradeLevelId = group?.grade_level_id ? str(group.grade_level_id) : null;

    // Sem a migração das competências, o portal simplesmente não mostra o cartão.
    const { data: competencyRows, error } = await db
      .from("siga_competencies")
      .select("id, subject_id, grade_level_id, code, description, display_order")
      .eq("school_id", schoolId)
      .eq("status", "active")
      .in("subject_id", subjectIds)
      .order("display_order")
      .order("code");
    if (error) return EMPTY;
    const competencies = ((competencyRows ?? []) as Row[]).filter(
      (c) => !c.grade_level_id || str(c.grade_level_id) === gradeLevelId,
    );
    if (!competencies.length) return EMPTY;

    const [{ data: subjects }, { data: items }, rule, { data: scale }] = await Promise.all([
      db.from("subjects").select("id, name").eq("school_id", schoolId).in("id", subjectIds),
      db
        .from("siga_assessment_items")
        .select("id, subject_id, max_score")
        .eq("school_id", schoolId)
        .eq("class_group_id", classGroupId)
        .in("subject_id", subjectIds),
      loadActiveRuleSummary(db, schoolId),
      db
        .from("grading_scales")
        .select("maximum_value")
        .eq("school_id", schoolId)
        .eq("is_active", true)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    const itemRows = (items ?? []) as Row[];
    const itemIds = itemRows.map((i) => str(i.id));
    const [{ data: links }, { data: scores }] = await Promise.all([
      itemIds.length
        ? db
            .from("siga_assessment_item_competencies")
            .select("item_id, competency_id")
            .eq("school_id", schoolId)
            .in("item_id", itemIds)
        : Promise.resolve({ data: [] as Row[] }),
      itemIds.length
        ? db
            .from("siga_assessment_scores")
            .select("item_id, score")
            .eq("school_id", schoolId)
            .eq("enrollment_id", enrollmentId)
            .in("item_id", itemIds)
        : Promise.resolve({ data: [] as Row[] }),
    ]);

    const scaleMax = Number(scale?.maximum_value ?? 20) || 20;
    const nameOf = new Map(((subjects ?? []) as Row[]).map((s) => [str(s.id), str(s.name)]));
    const out: StudentCompetencySubject[] = [];
    for (const subjectId of subjectIds) {
      const mine = competencies.filter((c) => str(c.subject_id) === subjectId);
      if (!mine.length) continue;
      const subjectItems = itemRows.filter((i) => str(i.subject_id) === subjectId);
      const mastery = computeMastery({
        competencyIds: mine.map((c) => str(c.id)),
        enrollmentIds: [enrollmentId],
        items: subjectItems.map((i) => ({
          itemId: str(i.id),
          maxScore: i.max_score == null ? null : Number(i.max_score),
        })),
        links: ((links ?? []) as Row[]).map((l) => ({
          itemId: str(l.item_id),
          competencyId: str(l.competency_id),
        })),
        scores: ((scores ?? []) as Row[]).map((s) => ({
          itemId: str(s.item_id),
          enrollmentId,
          score: s.score == null ? null : Number(s.score),
        })),
        passing: rule.passing,
        scaleMax,
      }).students[0];
      out.push({
        subjectId,
        subjectName: nameOf.get(subjectId) ?? "Disciplina",
        assessed: mastery?.assessed ?? 0,
        mastered: mastery?.mastered ?? 0,
        competencies: mine.map((c) => ({
          id: str(c.id),
          code: str(c.code),
          description: str(c.description),
          mastered:
            mastery?.competencies.find((m) => m.competencyId === str(c.id))?.mastered ?? null,
        })),
      });
    }
    out.sort((a, b) => a.subjectName.localeCompare(b.subjectName, "pt"));
    return { passing: rule.passing, subjects: out };
  });
