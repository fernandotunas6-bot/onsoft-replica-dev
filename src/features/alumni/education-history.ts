import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { loadSgaAdminClient, resolveSgaMembershipAdmin } from "@/integrations/supabase/sga-admin";
import { alumniPortfolioEducationLevels } from "@/features/alumni/portfolio";

export const alumniEducationStageSchema = z
  .object({
    stageId: z.string().uuid().optional(),
    educationLevel: z.enum(alumniPortfolioEducationLevels),
    institutionName: z.string().trim().min(2).max(220),
    courseName: z.string().trim().max(180).nullable().optional(),
    degreeName: z.string().trim().max(180).nullable().optional(),
    startedYear: z.number().int().min(1900).max(2200).nullable().optional(),
    endedYear: z.number().int().min(1900).max(2200).nullable().optional(),
    city: z.string().trim().max(120).nullable().optional(),
    province: z.string().trim().max(120).nullable().optional(),
    country: z.string().trim().max(120).nullable().optional(),
    isCurrent: z.boolean().optional().default(false),
    sortOrder: z.number().int().min(-10000).max(10000).optional().default(0),
  })
  .refine(
    (value) => !value.startedYear || !value.endedYear || value.endedYear >= value.startedYear,
    {
      message: "O ano final não pode ser anterior ao ano inicial.",
      path: ["endedYear"],
    },
  );

const deleteStageSchema = z.object({ stageId: z.string().uuid() });

async function resolveOwnProfile(userId: string) {
  const membership = await resolveSgaMembershipAdmin(userId);
  if (!membership) throw new Error("Sem vínculo activo com uma escola.");
  const db = await loadSgaAdminClient();
  const { data: profile, error } = await db
    .from("alumni_profiles")
    .select("id")
    .eq("school_id", membership.schoolId)
    .eq("auth_user_id", userId)
    .eq("self_service_enabled", true)
    .maybeSingle();
  if (error) throw publicDatabaseError(error, "Não foi possível validar o perfil Alumni.");
  if (!profile) throw new Error("O Portal Alumni ainda não está activado.");
  return { membership, db, alumniId: profile.id };
}

export const getMyAlumniEducationHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!context) throw new Error("Sessão inválida.");
    const { membership, db, alumniId } = await resolveOwnProfile(context.userId);
    const { data, error } = await db
      .from("alumni_education_stages")
      .select("*")
      .eq("school_id", membership.schoolId)
      .eq("alumni_id", alumniId)
      .order("education_level", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("started_year", { ascending: true });
    if (error)
      throw publicDatabaseError(error, "Não foi possível carregar o percurso educacional.");
    return data ?? [];
  });

export const saveMyAlumniEducationStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => alumniEducationStageSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida.");
    const { membership, db, alumniId } = await resolveOwnProfile(context.userId);
    const row = {
      school_id: membership.schoolId,
      alumni_id: alumniId,
      education_level: data.educationLevel,
      institution_name: data.institutionName,
      course_name: data.courseName,
      degree_name: data.degreeName,
      started_year: data.startedYear,
      ended_year: data.endedYear,
      city: data.city,
      province: data.province,
      country: data.country || "Angola",
      is_current: data.isCurrent,
      sort_order: data.sortOrder,
      updated_at: new Date().toISOString(),
    };
    const result = data.stageId
      ? await db
          .from("alumni_education_stages")
          .update(row)
          .eq("school_id", membership.schoolId)
          .eq("alumni_id", alumniId)
          .eq("id", data.stageId)
          .select("id")
          .single()
      : await db.from("alumni_education_stages").insert(row).select("id").single();
    if (result.error)
      throw publicDatabaseError(result.error, "Não foi possível guardar a etapa de formação.");
    return result.data;
  });

export const deleteMyAlumniEducationStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => deleteStageSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida.");
    const { membership, db, alumniId } = await resolveOwnProfile(context.userId);
    const { error } = await db
      .from("alumni_education_stages")
      .delete()
      .eq("school_id", membership.schoolId)
      .eq("alumni_id", alumniId)
      .eq("id", data.stageId);
    if (error) throw publicDatabaseError(error, "Não foi possível remover a etapa de formação.");
    return { ok: true };
  });
