/**
 * Competências (servidor): definir por disciplina, ligar às avaliações e ver o
 * domínio da turma. Tabelas só do servidor; lê e escreve com a chave de serviço
 * depois de validar o perfil. Definir: Administrador/Secretaria. Ligar
 * avaliações: esses ou o professor da disciplina na turma.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import {
  loadSgaAdminClient,
  requireSgaWriterFor,
  requireSgaWriterForWrite,
} from "@/integrations/supabase/sga-admin";
import { activeYearId, loadActiveRuleSummary, studentNames } from "./exam-data";
import {
  computeMastery,
  type CompetencyClassRate,
  type StudentMastery,
} from "./competency-mastery";
import { ownTeacherId } from "./own-teacher";

type Db = Awaited<ReturnType<typeof loadSgaAdminClient>>;
type Row = Record<string, unknown>;
const str = (v: unknown) => (v == null ? "" : String(v));

const READ_ROLES = ["Administrador", "Secretaria", "Professor"] as const;
const MANAGE_ROLES = ["Administrador", "Secretaria"] as const;

const MISSING = "Falta aplicar a migração das competências (20260927150000) na base de dados.";
function competencyDbError(error: { message?: string; code?: string }, fallback: string) {
  if (
    error.code === "42P01" ||
    /siga_competencies|siga_assessment_item_competencies/i.test(error.message ?? "")
  ) {
    return new Error(MISSING);
  }
  return publicDatabaseError(error, fallback);
}

const isManager = (roles: string[]) =>
  roles.some((r) => (MANAGE_ROLES as readonly string[]).includes(r));

export type Competency = {
  id: string;
  code: string;
  description: string;
  gradeLevelId: string | null;
};

export type CompetencyBoard = {
  classGroups: Array<{ id: string; name: string }>;
  classGroupId: string | null;
  subjects: Array<{ id: string; name: string }>;
  subjectId: string | null;
  gradeLevel: { id: string; name: string } | null;
  competencies: Competency[];
  items: Array<{
    id: string;
    name: string;
    term: number | null;
    maxScore: number | null;
    competencyIds: string[];
  }>;
  students: Array<{ enrollmentId: string; name: string }>;
  mastery: { students: StudentMastery[]; competencies: CompetencyClassRate[] };
  passing: number;
  canManage: boolean;
  canLink: boolean;
};

const boardInput = z.object({
  classGroupId: z.string().uuid().optional(),
  subjectId: z.string().uuid().optional(),
});

export const getCompetencyBoard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => boardInput.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<CompetencyBoard> => {
    const membership = await requireSgaWriterFor("pedagogica", context.supabase, context.userId, [
      ...READ_ROLES,
    ]);
    const db = await loadSgaAdminClient();
    const schoolId = membership.schoolId;
    const roles: string[] = membership.allAppRoles ?? [membership.appRole];
    const manager = isManager(roles);
    const empty: CompetencyBoard = {
      classGroups: [],
      classGroupId: null,
      subjects: [],
      subjectId: null,
      gradeLevel: null,
      competencies: [],
      items: [],
      students: [],
      mastery: { students: [], competencies: [] },
      passing: 10,
      canManage: manager,
      canLink: false,
    };

    const yearId = await activeYearId(db, schoolId);
    if (!yearId) return empty;
    const { data: groups } = await db
      .from("class_groups")
      .select("id, name, grade_level_id")
      .eq("school_id", schoolId)
      .eq("academic_year_id", yearId)
      .order("name");
    const classGroups = ((groups ?? []) as Row[]).map((g) => ({
      id: str(g.id),
      name: str(g.name),
      gradeLevelId: g.grade_level_id ? str(g.grade_level_id) : null,
    }));
    const group = classGroups.find((g) => g.id === data.classGroupId) ?? classGroups[0] ?? null;
    if (!group) return empty;

    const { data: classSubjects } = await db
      .from("class_subjects")
      .select("subject_id, teacher_id")
      .eq("school_id", schoolId)
      .eq("class_group_id", group.id)
      .eq("status", "active");
    const subjectIds = [...new Set(((classSubjects ?? []) as Row[]).map((c) => str(c.subject_id)))];
    const { data: subjectRows } = subjectIds.length
      ? await db.from("subjects").select("id, name").eq("school_id", schoolId).in("id", subjectIds)
      : { data: [] as Row[] };
    const subjects = ((subjectRows ?? []) as Row[])
      .map((s) => ({ id: str(s.id), name: str(s.name) }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt"));
    const subject = subjects.find((s) => s.id === data.subjectId) ?? subjects[0] ?? null;

    const base = {
      ...empty,
      classGroups: classGroups.map(({ id, name }) => ({ id, name })),
      classGroupId: group.id,
      subjects,
      subjectId: subject?.id ?? null,
    };
    if (!subject) return base;

    const teacherOfSubject = str(
      ((classSubjects ?? []) as Row[]).find((c) => str(c.subject_id) === subject.id)?.teacher_id,
    );
    const canLink =
      manager ||
      (Boolean(teacherOfSubject) &&
        (await ownTeacherId(db, schoolId, context.userId)) === teacherOfSubject);

    const [levelRes, competenciesRes, itemsRes, enrollmentsRes, rule, scaleRes] = await Promise.all(
      [
        group.gradeLevelId
          ? db
              .from("grade_levels")
              .select("id, name")
              .eq("school_id", schoolId)
              .eq("id", group.gradeLevelId)
              .maybeSingle()
          : Promise.resolve({ data: null as Row | null }),
        db
          .from("siga_competencies")
          .select("id, code, description, grade_level_id, display_order")
          .eq("school_id", schoolId)
          .eq("subject_id", subject.id)
          .eq("status", "active")
          .order("display_order")
          .order("code"),
        db
          .from("siga_assessment_items")
          .select("id, name, term, max_score, assessed_on")
          .eq("school_id", schoolId)
          .eq("class_group_id", group.id)
          .eq("subject_id", subject.id)
          .order("assessed_on", { ascending: true }),
        db
          .from("enrollments")
          .select("id")
          .eq("school_id", schoolId)
          .eq("class_group_id", group.id)
          .in("status", ["active", "pending"]),
        loadActiveRuleSummary(db, schoolId),
        db
          .from("grading_scales")
          .select("maximum_value")
          .eq("school_id", schoolId)
          .eq("is_active", true)
          .order("version", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ],
    );
    if (competenciesRes.error) {
      throw competencyDbError(competenciesRes.error, "Não foi possível ler as competências.");
    }

    // Competências da disciplina para todas as classes ou para a classe da turma.
    const competencies: Competency[] = ((competenciesRes.data ?? []) as Row[])
      .filter((c) => !c.grade_level_id || str(c.grade_level_id) === group.gradeLevelId)
      .map((c) => ({
        id: str(c.id),
        code: str(c.code),
        description: str(c.description),
        gradeLevelId: c.grade_level_id ? str(c.grade_level_id) : null,
      }));
    const itemRows = (itemsRes.data ?? []) as Row[];
    const itemIds = itemRows.map((i) => str(i.id));
    const enrollmentIds = ((enrollmentsRes.data ?? []) as Row[]).map((e) => str(e.id));

    const [linksRes, scoresRes, names] = await Promise.all([
      itemIds.length
        ? db
            .from("siga_assessment_item_competencies")
            .select("item_id, competency_id")
            .eq("school_id", schoolId)
            .in("item_id", itemIds)
        : Promise.resolve({ data: [] as Row[], error: null }),
      itemIds.length
        ? db
            .from("siga_assessment_scores")
            .select("item_id, enrollment_id, score")
            .eq("school_id", schoolId)
            .in("item_id", itemIds)
        : Promise.resolve({ data: [] as Row[], error: null }),
      studentNames(db, schoolId, enrollmentIds),
    ]);
    const links = ((linksRes.data ?? []) as Row[]).map((l) => ({
      itemId: str(l.item_id),
      competencyId: str(l.competency_id),
    }));
    const validCompetency = new Set(competencies.map((c) => c.id));
    const scaleMax = Number(scaleRes.data?.maximum_value ?? 20) || 20;

    const items = itemRows.map((i) => ({
      id: str(i.id),
      name: str(i.name),
      term: i.term == null ? null : Number(i.term),
      maxScore: i.max_score == null ? null : Number(i.max_score),
      competencyIds: links
        .filter((l) => l.itemId === str(i.id) && validCompetency.has(l.competencyId))
        .map((l) => l.competencyId),
    }));
    const students = enrollmentIds
      .map((id) => ({ enrollmentId: id, name: names.get(id)?.name ?? "Aluno" }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt"));

    const mastery = computeMastery({
      competencyIds: competencies.map((c) => c.id),
      enrollmentIds: students.map((s) => s.enrollmentId),
      items: items.map((i) => ({ itemId: i.id, maxScore: i.maxScore })),
      links: links.filter((l) => validCompetency.has(l.competencyId)),
      scores: ((scoresRes.data ?? []) as Row[]).map((s) => ({
        itemId: str(s.item_id),
        enrollmentId: str(s.enrollment_id),
        score: s.score == null ? null : Number(s.score),
      })),
      passing: rule.passing,
      scaleMax,
    });

    return {
      ...base,
      gradeLevel: levelRes.data
        ? { id: str(levelRes.data.id), name: str(levelRes.data.name) }
        : null,
      competencies,
      items,
      students,
      mastery,
      passing: rule.passing,
      canManage: manager,
      canLink,
    };
  });

const saveInput = z.object({
  id: z.string().uuid().optional(),
  subjectId: z.string().uuid(),
  gradeLevelId: z.string().uuid().nullable(),
  code: z.string().trim().min(1).max(20),
  description: z.string().trim().min(3).max(500),
});

export const saveCompetency = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => saveInput.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      [...MANAGE_ROLES],
    );
    const db = await loadSgaAdminClient();
    const schoolId = membership.schoolId;
    const { data: subject } = await db
      .from("subjects")
      .select("id")
      .eq("school_id", schoolId)
      .eq("id", data.subjectId)
      .maybeSingle();
    if (!subject) throw new Error("Disciplina não encontrada nesta escola.");
    const row = {
      school_id: schoolId,
      subject_id: data.subjectId,
      grade_level_id: data.gradeLevelId,
      code: data.code,
      description: data.description,
      updated_by: context.userId,
    };
    const { error } = data.id
      ? await db.from("siga_competencies").update(row).eq("school_id", schoolId).eq("id", data.id)
      : await db.from("siga_competencies").insert({ ...row, created_by: context.userId });
    if (error) {
      if (error.code === "23505") throw new Error("Já existe uma competência com esse código.");
      throw competencyDbError(error, "Não foi possível guardar a competência.");
    }
    return { ok: true };
  });

export const archiveCompetency = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      [...MANAGE_ROLES],
    );
    const db = await loadSgaAdminClient();
    const { error } = await db
      .from("siga_competencies")
      .update({ status: "archived", updated_by: context.userId })
      .eq("school_id", membership.schoolId)
      .eq("id", data.id);
    if (error) throw competencyDbError(error, "Não foi possível arquivar a competência.");
    return { ok: true };
  });

const linkInput = z.object({
  itemId: z.string().uuid(),
  competencyIds: z.array(z.string().uuid()).max(50),
});

/** Define as competências que uma avaliação avalia (substitui as anteriores). */
export const setItemCompetencies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => linkInput.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      [...READ_ROLES],
    );
    const db = await loadSgaAdminClient();
    const schoolId = membership.schoolId;
    const { data: item } = await db
      .from("siga_assessment_items")
      .select("id, class_group_id, subject_id")
      .eq("school_id", schoolId)
      .eq("id", data.itemId)
      .maybeSingle();
    if (!item) throw new Error("Avaliação não encontrada nesta escola.");

    const roles: string[] = membership.allAppRoles ?? [membership.appRole];
    if (!isManager(roles)) {
      const { data: cs } = await db
        .from("class_subjects")
        .select("teacher_id")
        .eq("school_id", schoolId)
        .eq("class_group_id", str(item.class_group_id))
        .eq("subject_id", str(item.subject_id))
        .maybeSingle();
      const mine = await ownTeacherId(db, schoolId, context.userId);
      if (!mine || mine !== str(cs?.teacher_id)) {
        throw new Error("Só o professor da disciplina (ou a coordenação) liga esta avaliação.");
      }
    }

    const wanted = [...new Set(data.competencyIds)];
    if (wanted.length) {
      const { data: valid } = await db
        .from("siga_competencies")
        .select("id")
        .eq("school_id", schoolId)
        .eq("subject_id", str(item.subject_id))
        .eq("status", "active")
        .in("id", wanted);
      if ((valid ?? []).length !== wanted.length) {
        throw new Error("Há competências que não pertencem a esta disciplina.");
      }
    }

    const { error: delError } = await db
      .from("siga_assessment_item_competencies")
      .delete()
      .eq("school_id", schoolId)
      .eq("item_id", data.itemId);
    if (delError) throw competencyDbError(delError, "Não foi possível actualizar a ligação.");
    if (wanted.length) {
      const { error } = await db.from("siga_assessment_item_competencies").insert(
        wanted.map((competencyId) => ({
          school_id: schoolId,
          item_id: data.itemId,
          competency_id: competencyId,
          created_by: context.userId,
        })),
      );
      if (error) throw competencyDbError(error, "Não foi possível ligar as competências.");
    }
    return { linked: wanted.length };
  });
