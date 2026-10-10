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
import { loadSgaAdminClient, requireSgaWriterForWrite } from "@/integrations/supabase/sga-admin";
import { recordAuditBatch } from "@/features/audit/record-audit";
import { EDUCATION_LEVELS, planCurriculum, summarizePlan } from "./curriculum-templates";
import { applyCurriculumPlan, type ApplyDb } from "./curriculum-templates-apply";
import { stage as findStage } from "@/features/education-catalog/data/stages";
import { planFromCatalog } from "@/features/education-catalog/plan-from-catalog";

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
