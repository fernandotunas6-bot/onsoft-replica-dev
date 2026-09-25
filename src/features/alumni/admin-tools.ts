import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import {
  loadSgaAdminClient,
  requireSgaWriterFor,
  requireSgaWriterForWrite,
} from "@/integrations/supabase/sga-admin";

const audienceSchema = z.object({
  graduationYear: z.number().int().min(1950).max(2100).optional(),
  province: z.string().trim().max(120).optional(),
  employmentStatus: z
    .enum(["employed", "self_employed", "student", "seeking", "unavailable", "unknown"])
    .optional(),
  mentoringOnly: z.boolean().optional().default(false),
  opportunitiesOnly: z.boolean().optional().default(false),
  purpose: z
    .enum(["general", "opportunities", "events", "mentoring", "surveys", "fundraising"])
    .default("general"),
});

async function adminContext(userId: string, mode: "read" | "write" = "read") {
  const membership = await (mode === "write" ? requireSgaWriterForWrite : requireSgaWriterFor)(
    "pessoas",
    userId,
    ["Administrador", "Secretaria"],
  );
  const db = await loadSgaAdminClient();
  return { membership, db };
}

export const getAlumniGeoAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!context) throw new Error("Sessão inválida.");
    const { membership, db } = await adminContext(context.userId);
    const { data, error } = await db
      .from("alumni_profiles")
      .select(
        "id, graduation_year, employment_status, industry, city, province, country, available_for_mentoring, open_to_opportunities",
      )
      .eq("school_id", membership.schoolId)
      .not("province", "is", null);
    if (error)
      throw publicDatabaseError(
        error,
        "Não foi possível carregar a distribuição geográfica Alumni.",
      );

    const provinces = new Map<
      string,
      {
        total: number;
        employed: number;
        mentors: number;
        openToOpportunities: number;
        cities: Set<string>;
      }
    >();
    for (const row of data ?? []) {
      const key = row.province || "Sem província";
      const item = provinces.get(key) ?? {
        total: 0,
        employed: 0,
        mentors: 0,
        openToOpportunities: 0,
        cities: new Set<string>(),
      };
      item.total += 1;
      if (["employed", "self_employed"].includes(row.employment_status)) item.employed += 1;
      if (row.available_for_mentoring) item.mentors += 1;
      if (row.open_to_opportunities) item.openToOpportunities += 1;
      if (row.city) item.cities.add(row.city);
      provinces.set(key, item);
    }

    return [...provinces.entries()]
      .map(([province, value]) => ({
        province,
        total: value.total,
        employed: value.employed,
        mentors: value.mentors,
        openToOpportunities: value.openToOpportunities,
        cities: [...value.cities].sort(),
      }))
      .sort((a, b) => b.total - a.total);
  });

export const buildAlumniCommunicationAudience = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => audienceSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida.");
    const { membership, db } = await adminContext(context.userId);
    let profileQuery = db
      .from("alumni_profiles")
      .select(
        "id, person_id, graduation_year, province, employment_status, available_for_mentoring, open_to_opportunities, contact_consent, directory_visibility",
      )
      .eq("school_id", membership.schoolId)
      .eq("contact_consent", true);
    if (data.graduationYear) profileQuery = profileQuery.eq("graduation_year", data.graduationYear);
    if (data.province) profileQuery = profileQuery.eq("province", data.province);
    if (data.employmentStatus)
      profileQuery = profileQuery.eq("employment_status", data.employmentStatus);
    if (data.mentoringOnly) profileQuery = profileQuery.eq("available_for_mentoring", true);
    if (data.opportunitiesOnly) profileQuery = profileQuery.eq("open_to_opportunities", true);

    const { data: profiles, error } = await profileQuery;
    if (error) throw publicDatabaseError(error, "Não foi possível construir o público Alumni.");
    const ids = (profiles ?? []).map((row) => row.id);
    const personIds = (profiles ?? []).map((row) => row.person_id);
    if (!ids.length) return [];

    const [{ data: people }, { data: preferences }] = await Promise.all([
      db
        .from("people")
        .select("id, full_name, email, phone")
        .eq("school_id", membership.schoolId)
        .in("id", personIds),
      db
        .from("alumni_communication_preferences")
        .select(
          "alumni_id, email_enabled, sms_enabled, whatsapp_enabled, opportunities_enabled, events_enabled, mentoring_enabled, surveys_enabled, fundraising_enabled",
        )
        .eq("school_id", membership.schoolId)
        .in("alumni_id", ids),
    ]);
    const peopleById = new Map((people ?? []).map((row) => [row.id, row]));
    const preferencesById = new Map((preferences ?? []).map((row) => [row.alumni_id, row]));

    const purposeKey = `${data.purpose}_enabled`;
    const result = (profiles ?? []).flatMap((profile) => {
      const person = peopleById.get(profile.person_id);
      const prefs = preferencesById.get(profile.id);
      if (!person) return [];
      if (
        data.purpose !== "general" &&
        prefs &&
        (prefs as Record<string, any>)[purposeKey] === false
      )
        return [];
      return [
        {
          alumniId: profile.id,
          fullName: person.full_name,
          email: prefs?.email_enabled === false ? null : person.email,
          phone: prefs?.sms_enabled || prefs?.whatsapp_enabled ? person.phone : null,
          graduationYear: profile.graduation_year,
          province: profile.province,
        },
      ];
    });

    return result;
  });

export const getAlumniExportDataset = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!context) throw new Error("Sessão inválida.");
    const { membership, db } = await adminContext(context.userId);
    const { data: profiles, error } = await db
      .from("alumni_profiles")
      .select(
        "id, person_id, graduation_year, graduation_grade, graduation_course, headline, current_company, current_role, employment_status, industry, city, province, country, skills, interests, available_for_mentoring, seeking_mentor, open_to_opportunities, directory_visibility, contact_consent, verified_at, profile_completion, last_engagement_at",
      )
      .eq("school_id", membership.schoolId)
      .order("graduation_year", { ascending: false, nullsFirst: false });
    if (error) throw publicDatabaseError(error, "Não foi possível preparar a exportação Alumni.");

    const personIds = (profiles ?? []).map((row) => row.person_id);
    const { data: people } = personIds.length
      ? await db
          .from("people")
          .select("id, full_name, email, phone")
          .eq("school_id", membership.schoolId)
          .in("id", personIds)
      : { data: [] };
    const peopleById = new Map((people ?? []).map((row) => [row.id, row]));

    return (profiles ?? []).map((profile) => {
      const person = peopleById.get(profile.person_id);
      return {
        alumni_id: profile.id,
        nome: person?.full_name ?? "—",
        email: profile.contact_consent ? (person?.email ?? null) : null,
        telefone: profile.contact_consent ? (person?.phone ?? null) : null,
        ano_conclusao: profile.graduation_year,
        classe_curso: profile.graduation_course || profile.graduation_grade,
        funcao_actual: profile.current_role,
        organizacao: profile.current_company,
        situacao_profissional: profile.employment_status,
        sector: profile.industry,
        cidade: profile.city,
        provincia: profile.province,
        pais: profile.country,
        competencias: profile.skills,
        interesses: profile.interests,
        mentor_disponivel: profile.available_for_mentoring,
        procura_mentor: profile.seeking_mentor,
        aberto_oportunidades: profile.open_to_opportunities,
        visibilidade: profile.directory_visibility,
        consentimento_contacto: profile.contact_consent,
        verificado_em: profile.verified_at,
        perfil_completo_percent: profile.profile_completion,
        ultima_interacao: profile.last_engagement_at,
      };
    });
  });
