import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { loadSgaAdminClient, requireSgaWriter, resolveSgaMembershipAdmin } from "@/integrations/supabase/sga-admin";

export const alumniPortfolioItemTypes = ["project", "publication", "award", "certificate", "media", "link", "case_study", "other"] as const;
export const alumniPortfolioVisibility = ["private", "school", "alumni"] as const;

const nullableText = (max: number) => z.union([z.string().trim().max(max), z.null()]).optional();
const nullableUrl = z.union([z.string().trim().url(), z.literal(""), z.null()]).optional().transform((value) => value === "" ? null : value);

export const portfolioItemSchema = z.object({
  itemId: z.string().uuid().optional(),
  itemType: z.enum(alumniPortfolioItemTypes),
  title: z.string().trim().min(2).max(180),
  summary: nullableText(3000),
  organization: nullableText(180),
  role: nullableText(180),
  startedOn: z.string().date().nullable().optional(),
  endedOn: z.string().date().nullable().optional(),
  externalUrl: nullableUrl,
  imageUrl: nullableUrl,
  officialDocumentRequestId: z.string().uuid().nullable().optional(),
  skills: z.array(z.string().trim().min(1).max(80)).max(30).optional().default([]),
  tags: z.array(z.string().trim().min(1).max(80)).max(30).optional().default([]),
  featured: z.boolean().optional().default(false),
  visibility: z.enum(alumniPortfolioVisibility).optional().default("alumni"),
  sortOrder: z.number().int().min(-10000).max(10000).optional().default(0),
}).refine((value) => !value.startedOn || !value.endedOn || value.endedOn >= value.startedOn, {
  message: "A data final não pode ser anterior à data inicial.",
  path: ["endedOn"],
});

const portfolioAdminListSchema = z.object({ alumniId: z.string().uuid() });
const portfolioDeleteSchema = z.object({ itemId: z.string().uuid() });
const portfolioFeaturedSchema = z.object({ itemId: z.string().uuid(), featured: z.boolean() });

async function resolveOwnProfile(userId: string) {
  const membership = await resolveSgaMembershipAdmin(userId);
  if (!membership) throw new Error("Sem vínculo activo com uma escola.");
  const db = await loadSgaAdminClient();
  const { data: profile, error } = await db.from("alumni_profiles")
    .select("id, student_id")
    .eq("school_id", membership.schoolId)
    .eq("auth_user_id", userId)
    .eq("self_service_enabled", true)
    .maybeSingle();
  if (error) throw publicDatabaseError(error, "Não foi possível validar o seu perfil Alumni.");
  if (!profile) throw new Error("O seu Portal Alumni ainda não está activado.");
  return { membership, db, alumniId: profile.id, studentId: profile.student_id };
}

async function validateOfficialDocument(db: Awaited<ReturnType<typeof loadSgaAdminClient>>, schoolId: string, alumniId: string, requestId: string | null | undefined) {
  if (!requestId) return;
  const { data: profile } = await db.from("alumni_profiles").select("student_id").eq("school_id", schoolId).eq("id", alumniId).maybeSingle();
  if (!profile) throw new Error("Perfil Alumni não encontrado.");
  const { data: request, error } = await db.from("document_requests")
    .select("id")
    .eq("school_id", schoolId)
    .eq("student_id", profile.student_id)
    .eq("id", requestId)
    .maybeSingle();
  if (error) throw publicDatabaseError(error, "Não foi possível validar o documento oficial.");
  if (!request) throw new Error("O documento seleccionado não pertence a este Alumni.");
}

function payload(data: z.infer<typeof portfolioItemSchema>, schoolId: string, alumniId: string) {
  return {
    school_id: schoolId,
    alumni_id: alumniId,
    item_type: data.itemType,
    title: data.title,
    summary: data.summary,
    organization: data.organization,
    role: data.role,
    started_on: data.startedOn,
    ended_on: data.endedOn,
    external_url: data.externalUrl,
    image_url: data.imageUrl,
    official_document_request_id: data.officialDocumentRequestId,
    skills: data.skills,
    tags: data.tags,
    featured: data.featured,
    visibility: data.visibility,
    sort_order: data.sortOrder,
    updated_at: new Date().toISOString(),
  };
}

export const getMyAlumniPortfolio = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!context) throw new Error("Sessão inválida.");
    const { membership, db, alumniId } = await resolveOwnProfile(context.userId);
    const { data, error } = await db.from("alumni_portfolio_items")
      .select("*, document_requests(id, request_type, status, created_at)")
      .eq("school_id", membership.schoolId)
      .eq("alumni_id", alumniId)
      .order("featured", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) throw publicDatabaseError(error, "Não foi possível carregar o seu portfólio.");
    return data ?? [];
  });

export const getMyPortfolioDocumentOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!context) throw new Error("Sessão inválida.");
    const { membership, db, studentId } = await resolveOwnProfile(context.userId);
    const { data, error } = await db.from("document_requests")
      .select("id, request_type, status, created_at")
      .eq("school_id", membership.schoolId)
      .eq("student_id", studentId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw publicDatabaseError(error, "Não foi possível carregar os seus documentos oficiais.");
    return data ?? [];
  });

export const saveMyAlumniPortfolioItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => portfolioItemSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida.");
    const { membership, db, alumniId } = await resolveOwnProfile(context.userId);
    await validateOfficialDocument(db, membership.schoolId, alumniId, data.officialDocumentRequestId);
    const row = payload(data, membership.schoolId, alumniId);
    const result = data.itemId
      ? await db.from("alumni_portfolio_items").update(row).eq("school_id", membership.schoolId).eq("alumni_id", alumniId).eq("id", data.itemId).select("id").single()
      : await db.from("alumni_portfolio_items").insert(row).select("id").single();
    if (result.error) throw publicDatabaseError(result.error, "Não foi possível guardar o item do portfólio.");
    return result.data;
  });

export const deleteMyAlumniPortfolioItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => portfolioDeleteSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida.");
    const { membership, db, alumniId } = await resolveOwnProfile(context.userId);
    const { error } = await db.from("alumni_portfolio_items").delete().eq("school_id", membership.schoolId).eq("alumni_id", alumniId).eq("id", data.itemId);
    if (error) throw publicDatabaseError(error, "Não foi possível remover o item do portfólio.");
    return { ok: true };
  });

export const listAlumniPortfolioAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => portfolioAdminListSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida.");
    const membership = await requireSgaWriter(context.userId, ["Administrador", "Secretaria"]);
    const db = await loadSgaAdminClient();
    const { data: profile } = await db.from("alumni_profiles").select("id").eq("school_id", membership.schoolId).eq("id", data.alumniId).maybeSingle();
    if (!profile) throw new Error("Alumni não encontrado nesta escola.");
    const { data: items, error } = await db.from("alumni_portfolio_items")
      .select("*, document_requests(id, request_type, status, created_at)")
      .eq("school_id", membership.schoolId)
      .eq("alumni_id", data.alumniId)
      .order("featured", { ascending: false })
      .order("sort_order", { ascending: true });
    if (error) throw publicDatabaseError(error, "Não foi possível carregar o portfólio Alumni.");
    return items ?? [];
  });

export const setAlumniPortfolioFeatured = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => portfolioFeaturedSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida.");
    const membership = await requireSgaWriter(context.userId, ["Administrador", "Secretaria"]);
    const db = await loadSgaAdminClient();
    const { error } = await db.from("alumni_portfolio_items").update({ featured: data.featured, updated_at: new Date().toISOString() })
      .eq("school_id", membership.schoolId).eq("id", data.itemId);
    if (error) throw publicDatabaseError(error, "Não foi possível actualizar o destaque do portfólio.");
    return { ok: true };
  });
