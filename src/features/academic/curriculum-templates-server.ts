/**
 * «Usar modelo de estrutura» — aplica um modelo de curriculum-templates.ts à
 * escola da sessão.
 *
 * Só Administrador e Secretaria, com escrita no módulo Pedagógica. Usa o
 * cliente privilegiado porque `academic_levels`, `programs` e `campuses` não
 * têm política de escrita para utilizadores e `subjects` exige sessão com MFA;
 * a escola vem sempre da membership, nunca do browser.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  loadSgaAdminClient,
  requireSgaWriterFor,
  requireSgaWriterForWrite,
} from "@/integrations/supabase/sga-admin";
import { recordAuditBatch } from "@/features/audit/record-audit";
import { EDUCATION_LEVELS, planCurriculum, summarizePlan } from "./curriculum-templates";
import { applyCurriculumPlan, type ApplyDb } from "./curriculum-templates-apply";
import { stage as findStage } from "@/features/education-catalog/data/stages";
import { planFromCatalog } from "@/features/education-catalog/plan-from-catalog";
import {
  catalogCourse,
  courseInScope,
  reviewCourses,
  type CourseReview,
} from "@/features/education-catalog/course-review";
import { levelScope } from "@/features/education-catalog/normalize";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { requireAal2 } from "@/features/hr/require-aal2";

const levelIds = EDUCATION_LEVELS.map((l) => l.id) as [string, ...string[]];

export const applyCurriculumTemplateInputSchema = z.object({
  courses: z.record(z.enum(levelIds), z.array(z.string().trim().min(1).max(20)).max(20)),
  groupsPerGrade: z.number().int().min(1).max(10).default(1),
  shifts: z
    .array(z.enum(["morning", "afternoon", "evening"]))
    .min(1)
    .max(3)
    .default(["morning"]),
  capacity: z.number().int().min(5).max(120).default(35),
  createRooms: z.boolean().default(true),
});

export const applyCurriculumTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => applyCurriculumTemplateInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      ["Administrador", "Secretaria"],
    );
    const plan = planCurriculum(data);
    if (!plan.programs.length) throw new Error("Escolha pelo menos um curso ou nível de ensino.");
    const db = (await loadSgaAdminClient()) as unknown as ApplyDb;
    const result = await applyCurriculumPlan(
      db,
      { schoolId: membership.schoolId, userId: context.userId },
      plan,
    );
    await recordAuditBatch([
      {
        schoolId: membership.schoolId,
        actorUserId: context.userId,
        action: "academic.template.applied",
        entityType: "academic_structure",
        entityId: membership.schoolId,
        metadata: { planned: summarizePlan(plan), created: result.created },
      },
    ]).catch(() => undefined);
    return result;
  });

export const applyCatalogStructureInputSchema = z
  .object({
    country: z.string().trim().length(2).toUpperCase(),
    stages: z.record(
      z.string().trim().min(2).max(20),
      z.array(z.string().trim().min(3).max(20)).max(30),
    ),
    groupsPerGrade: z.number().int().min(1).max(10).default(1),
    shifts: z
      .array(z.enum(["morning", "afternoon", "evening"]))
      .min(1)
      .max(3)
      .default(["morning"]),
    capacity: z.number().int().min(5).max(120).default(35),
    createRooms: z.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    // Só etapas do país escolhido e cursos dessas etapas: nada inventado no browser.
    for (const [stageId, courses] of Object.entries(value.stages)) {
      const st = findStage(stageId);
      if (!st || st.country !== value.country) {
        ctx.addIssue({
          code: "custom",
          message: `Etapa desconhecida para ${value.country}: ${stageId}.`,
        });
        continue;
      }
      for (const c of courses) {
        if (!st.courses.includes(c)) {
          ctx.addIssue({ code: "custom", message: `O curso ${c} não existe em «${st.name}».` });
        }
      }
    }
  });

/** «Estrutura do catálogo»: o mesmo que o modelo angolano, a partir do catálogo nacional. */
export const applyCatalogStructure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => applyCatalogStructureInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      ["Administrador", "Secretaria"],
    );
    const plan = planFromCatalog(data);
    if (!plan.programs.length) throw new Error("Escolha pelo menos um nível de ensino ou curso.");
    const db = (await loadSgaAdminClient()) as unknown as ApplyDb;
    const result = await applyCurriculumPlan(
      db,
      { schoolId: membership.schoolId, userId: context.userId },
      plan,
    );
    await recordAuditBatch([
      {
        schoolId: membership.schoolId,
        actorUserId: context.userId,
        action: "academic.template.applied",
        entityType: "academic_structure",
        entityId: membership.schoolId,
        metadata: {
          source: "education-catalog",
          country: data.country,
          stages: data.stages,
          planned: summarizePlan(plan),
          created: result.created,
        },
      },
    ]).catch(() => undefined);
    return result;
  });

const COURSE_LINK_MIGRATION = "20261012120000_subjects_catalog_link.sql";

/** Lê os cursos com o cliente do utilizador (`programs_select_authorized`). */
async function loadCourseReview(
  db: { from: (table: "programs" | "academic_levels") => unknown },
  schoolId: string,
): Promise<CourseReview> {
  // `*`: `catalog_course_code` só existe depois de 20261012120000.
  const query = db.from("programs") as {
    select: (c: string) => {
      eq: (
        c: string,
        v: string,
      ) => PromiseLike<{ data: Array<Record<string, unknown>> | null; error: unknown }>;
    };
  };
  const levelsQuery = db.from("academic_levels") as typeof query;
  const [{ data, error }, levels] = await Promise.all([
    query.select("*").eq("school_id", schoolId),
    levelsQuery.select("id, code, name").eq("school_id", schoolId),
  ]);
  if (error) {
    throw publicDatabaseError(error as { message: string }, "Não foi possível ler os cursos.");
  }
  // O nível diz se o curso é superior: «Contabilidade» é outro curso em cada um.
  const levelById = new Map(
    (levels.data ?? []).map((l) => [
      String(l["id"]),
      { code: String(l["code"] ?? ""), name: String(l["name"] ?? "") },
    ]),
  );
  const rows = data ?? [];
  return reviewCourses(
    rows.map((r) => ({
      id: String(r["id"]),
      code: String(r["code"] ?? ""),
      name: String(r["name"] ?? ""),
      catalogCode: typeof r["catalog_course_code"] === "string" ? r["catalog_course_code"] : null,
      scope: levelScope(levelById.get(String(r["academic_level_id"] ?? ""))),
    })),
    rows.length > 0 && "catalog_course_code" in rows[0]!,
  );
}

export const getCourseReview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const membership = await requireSgaWriterFor("pedagogica", context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    return loadCourseReview(context.supabase, membership.schoolId);
  });

export const linkCoursesToCatalogInputSchema = z.object({
  auto: z.array(z.string().guid()).max(200).default([]),
  manual: z
    .array(
      z.object({
        programId: z.string().guid(),
        catalogCode: z.string().regex(/^[A-Z][A-Z0-9-]{0,23}$/),
      }),
    )
    .max(50)
    .default([]),
});

/**
 * Grava `programs.catalog_course_code`. `programs` não tem política de
 * escrita para utilizadores: grava com o cliente privilegiado, só na escola da
 * membership, só o que a revisão (recalculada aqui) sugere ou um código que o
 * catálogo conhece, nunca por cima de uma ligação existente. 2FA e auditoria.
 */
export const linkCoursesToCatalog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => linkCoursesToCatalogInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await requireSgaWriterForWrite(
      "pedagogica",
      context.supabase,
      context.userId,
      ["Administrador", "Secretaria"],
    );
    requireAal2(context.claims, "Ligar cursos ao catálogo");
    const review = await loadCourseReview(context.supabase, membership.schoolId);
    if (!review.linkAvailable && review.total) {
      throw new Error(
        `Ligar cursos ao catálogo ainda não está activo no servidor: falta aplicar a migração ${COURSE_LINK_MIGRATION}.`,
      );
    }
    const wanted = new Set(data.auto);
    const unmatched = new Map(review.unmatched.map((u) => [u.id, u]));
    const links = [
      ...review.toLink
        .filter((l) => wanted.has(l.id))
        .map((l) => ({ id: l.id, name: l.name, catalogCode: l.catalogCode, how: "name" })),
      ...data.manual
        .filter((m) => {
          const course = catalogCourse(m.catalogCode);
          const own = unmatched.get(m.programId);
          return Boolean(own && course && courseInScope(course, own.scope));
        })
        .map((m) => ({
          id: m.programId,
          name: unmatched.get(m.programId)!.name,
          catalogCode: m.catalogCode,
          how: "manual",
        })),
    ];
    const db = await loadSgaAdminClient();
    const applied: typeof links = [];
    for (const link of links) {
      // Sem tipos: a coluna só existe depois de 20261012120000.
      const { data: row, error } = await db
        .from("programs")
        .update({ catalog_course_code: link.catalogCode } as never)
        .eq("id", link.id)
        .eq("school_id", membership.schoolId)
        .is("catalog_course_code" as never, null)
        .select("id")
        .maybeSingle();
      if (error) throw publicDatabaseError(error, `Não foi possível ligar «${link.name}».`);
      if (row) applied.push(link);
    }
    if (applied.length) {
      await recordAuditBatch(
        applied.map((a) => ({
          schoolId: membership.schoolId,
          actorUserId: context.userId,
          action: "academic.program.linked_to_catalog",
          entityType: "program",
          entityId: a.id,
          metadata: { name: a.name, catalogCode: a.catalogCode, how: a.how },
        })),
      ).catch(() => undefined);
    }
    return {
      applied: applied.length,
      skipped: links.length - applied.length,
      ignored: data.auto.length + data.manual.length - links.length,
    };
  });
