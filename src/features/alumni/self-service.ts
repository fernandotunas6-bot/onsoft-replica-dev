import type { Json } from "@/integrations/supabase/types";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nullableHttpUrlSchema } from "@/lib/safe-url";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { loadSgaAdminClient, resolveSgaMembershipAdmin } from "@/integrations/supabase/sga-admin";

const updateSelfProfileSchema = z.object({
  headline: z.string().trim().max(180).nullable().optional(),
  biography: z.string().trim().max(3000).nullable().optional(),
  currentCompany: z.string().trim().max(180).nullable().optional(),
  currentRole: z.string().trim().max(180).nullable().optional(),
  employmentStatus: z
    .enum(["employed", "self_employed", "student", "seeking", "unavailable", "unknown"])
    .optional(),
  industry: z.string().trim().max(120).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  province: z.string().trim().max(120).nullable().optional(),
  country: z.string().trim().max(120).nullable().optional(),
  linkedinUrl: nullableHttpUrlSchema,
  websiteUrl: nullableHttpUrlSchema,
  skills: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  interests: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  availableForMentoring: z.boolean().optional(),
  seekingMentor: z.boolean().optional(),
  openToOpportunities: z.boolean().optional(),
  directoryVisibility: z.enum(["private", "school", "alumni"]).optional(),
  contactConsent: z.boolean().optional(),
});

const opportunityActionSchema = z.object({
  opportunityId: z.string().uuid(),
  status: z.enum(["interested", "applied", "withdrawn"]).default("interested"),
});

const eventActionSchema = z.object({ eventId: z.string().uuid() });
const surveyActionSchema = z.object({
  surveyId: z.string().uuid(),
  response: z.record(z.string(), z.unknown()),
});

async function resolveSchool(userId: string) {
  const membership = await resolveSgaMembershipAdmin(userId);
  if (!membership) throw new Error("Sem vínculo activo com uma escola.");
  const db = await loadSgaAdminClient();
  return { membership, db };
}

async function resolveOwnProfile(userId: string) {
  const { membership, db } = await resolveSchool(userId);
  const { data: profile, error } = await db
    .from("alumni_profiles")
    .select("*")
    .eq("school_id", membership.schoolId)
    .eq("auth_user_id", userId)
    .eq("self_service_enabled", true)
    .maybeSingle();
  if (error) throw publicDatabaseError(error, "Não foi possível validar o seu perfil Alumni.");
  if (!profile) throw new Error("O seu acesso Alumni ainda não está activado para esta escola.");
  return { membership, db, profile };
}

export const claimMyAlumniProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!context) throw new Error("Sessão inválida.");
    const { membership, db } = await resolveSchool(context.userId);
    const { data: authResult, error: authError } = await db.auth.admin.getUserById(context.userId);
    if (authError) throw new Error("Não foi possível validar a conta autenticada.");
    // Só um e-mail confirmado liga a conta à ficha (como resolveVerifiedAccountEmail):
    // uma conta criada com o e-mail de outra pessoa ficava com o perfil dela.
    if (!authResult.user?.email_confirmed_at) {
      throw new Error("Confirme o e-mail da conta antes de activar o portal Alumni.");
    }
    const email = authResult.user?.email?.trim().toLowerCase();
    if (!email)
      throw new Error("A conta precisa de um e-mail válido para activar o portal Alumni.");

    const { data: person, error: personError } = await db
      .from("people")
      .select("id, email")
      .eq("school_id", membership.schoolId)
      // ilike sem curingas: «_» e «%» no e-mail são letras, não padrões.
      .ilike(
        "email",
        email.replace(/[\\%_]/g, (char) => `\\${char}`),
      )
      .maybeSingle();
    if (personError)
      throw publicDatabaseError(personError, "Não foi possível validar a identidade na escola.");
    if (!person)
      throw new Error("Não existe um antigo aluno desta escola com o e-mail da conta autenticada.");

    const { data: profile, error: profileError } = await db
      .from("alumni_profiles")
      .select("id, auth_user_id")
      .eq("school_id", membership.schoolId)
      .eq("person_id", person.id)
      .maybeSingle();
    if (profileError)
      throw publicDatabaseError(profileError, "Não foi possível localizar o perfil Alumni.");
    if (!profile) throw new Error("O seu processo ainda não foi activado na rede Alumni.");
    if (profile.auth_user_id && profile.auth_user_id !== context.userId) {
      throw new Error("Este perfil Alumni já está associado a outra conta.");
    }

    const { error } = await db
      .from("alumni_profiles")
      .update({
        auth_user_id: context.userId,
        self_service_enabled: true,
        self_service_claimed_at: new Date().toISOString(),
      })
      .eq("school_id", membership.schoolId)
      .eq("id", profile.id);
    if (error) throw publicDatabaseError(error, "Não foi possível activar o portal Alumni.");
    return { ok: true, alumniId: profile.id };
  });

export const getMyAlumniPortal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!context) throw new Error("Sessão inválida.");
    const { membership, db, profile } = await resolveOwnProfile(context.userId);
    const now = new Date().toISOString();

    const [
      personResult,
      experiencesResult,
      applicationsResult,
      opportunitiesResult,
      eventsResult,
      registrationsResult,
      surveysResult,
      mentorshipsResult,
    ] = await Promise.all([
      db
        .from("people")
        .select("id, full_name, email, phone, photo_url")
        .eq("school_id", membership.schoolId)
        .eq("id", profile.person_id)
        .maybeSingle(),
      db
        .from("alumni_experiences")
        .select("*")
        .eq("school_id", membership.schoolId)
        .eq("alumni_id", profile.id)
        .order("started_on", { ascending: false, nullsFirst: false }),
      db
        .from("alumni_opportunity_applications")
        .select("*, alumni_opportunities(title, organization, opportunity_type, status)")
        .eq("school_id", membership.schoolId)
        .eq("alumni_id", profile.id)
        .order("created_at", { ascending: false }),
      db
        .from("alumni_opportunities")
        .select("*")
        .eq("school_id", membership.schoolId)
        .eq("status", "published")
        .or(`expires_at.is.null,expires_at.gte.${now}`)
        .order("created_at", { ascending: false })
        .limit(50),
      db
        .from("alumni_events")
        .select("*")
        .eq("school_id", membership.schoolId)
        .eq("status", "published")
        .gte("starts_at", now)
        .order("starts_at", { ascending: true })
        .limit(50),
      db
        .from("alumni_event_registrations")
        .select("event_id, status, registered_at")
        .eq("school_id", membership.schoolId)
        .eq("alumni_id", profile.id),
      db
        .from("alumni_surveys")
        .select("id, title, description, purpose, schema_json, opens_at, closes_at")
        .eq("school_id", membership.schoolId)
        .eq("status", "published")
        .or(`closes_at.is.null,closes_at.gte.${now}`)
        .order("created_at", { ascending: false })
        .limit(20),
      db
        .from("alumni_mentorships")
        .select("*")
        .eq("school_id", membership.schoolId)
        .or(`mentor_alumni_id.eq.${profile.id},mentee_alumni_id.eq.${profile.id}`)
        .order("created_at", { ascending: false }),
    ]);

    return {
      profile,
      person: personResult.data,
      experiences: experiencesResult.data ?? [],
      applications: applicationsResult.data ?? [],
      opportunities: opportunitiesResult.data ?? [],
      events: eventsResult.data ?? [],
      registrations: registrationsResult.data ?? [],
      surveys: surveysResult.data ?? [],
      mentorships: mentorshipsResult.data ?? [],
    };
  });

export const updateMyAlumniProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => updateSelfProfileSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida.");
    const { membership, db, profile } = await resolveOwnProfile(context.userId);
    const { error } = await db
      .from("alumni_profiles")
      .update({
        headline: data.headline,
        biography: data.biography,
        current_company: data.currentCompany,
        current_role: data.currentRole,
        employment_status: data.employmentStatus,
        industry: data.industry,
        city: data.city,
        province: data.province,
        country: data.country,
        linkedin_url: data.linkedinUrl === "" ? null : data.linkedinUrl,
        website_url: data.websiteUrl === "" ? null : data.websiteUrl,
        skills: data.skills,
        interests: data.interests,
        available_for_mentoring: data.availableForMentoring,
        seeking_mentor: data.seekingMentor,
        open_to_opportunities: data.openToOpportunities,
        directory_visibility: data.directoryVisibility,
        contact_consent: data.contactConsent,
        updated_at: new Date().toISOString(),
      })
      .eq("school_id", membership.schoolId)
      .eq("id", profile.id);
    if (error) throw publicDatabaseError(error, "Não foi possível actualizar o perfil Alumni.");
    return { ok: true };
  });

export const saveMyOpportunityInterest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => opportunityActionSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida.");
    const { membership, db, profile } = await resolveOwnProfile(context.userId);
    const { data: opportunity } = await db
      .from("alumni_opportunities")
      .select("id")
      .eq("school_id", membership.schoolId)
      .eq("id", data.opportunityId)
      .eq("status", "published")
      .maybeSingle();
    if (!opportunity) throw new Error("Esta oportunidade já não está disponível.");
    const { error } = await db.from("alumni_opportunity_applications").upsert(
      {
        school_id: membership.schoolId,
        opportunity_id: data.opportunityId,
        alumni_id: profile.id,
        status: data.status,
        applied_at: data.status === "applied" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "opportunity_id,alumni_id" },
    );
    if (error) throw publicDatabaseError(error, "Não foi possível actualizar a candidatura.");
    return { ok: true };
  });

export const registerMyAlumniEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => eventActionSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida.");
    const { membership, db, profile } = await resolveOwnProfile(context.userId);
    const { data: event } = await db
      .from("alumni_events")
      .select("id, capacity")
      .eq("school_id", membership.schoolId)
      .eq("id", data.eventId)
      .eq("status", "published")
      .maybeSingle();
    if (!event) throw new Error("Este evento já não está disponível.");
    const { count } = await db
      .from("alumni_event_registrations")
      .select("id", { count: "exact", head: true })
      .eq("school_id", membership.schoolId)
      .eq("event_id", data.eventId)
      .in("status", ["registered", "attended"]);
    const status = event.capacity && (count ?? 0) >= event.capacity ? "waitlist" : "registered";
    const { error } = await db
      .from("alumni_event_registrations")
      .upsert(
        { school_id: membership.schoolId, event_id: data.eventId, alumni_id: profile.id, status },
        { onConflict: "event_id,alumni_id" },
      );
    if (error) throw publicDatabaseError(error, "Não foi possível efectuar a inscrição.");
    return { ok: true, status };
  });

export const submitMyAlumniSurvey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => surveyActionSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida.");
    const { membership, db, profile } = await resolveOwnProfile(context.userId);
    const now = new Date().toISOString();
    const { data: survey } = await db
      .from("alumni_surveys")
      .select("id")
      .eq("school_id", membership.schoolId)
      .eq("id", data.surveyId)
      .eq("status", "published")
      .or(`closes_at.is.null,closes_at.gte.${now}`)
      .maybeSingle();
    if (!survey) throw new Error("Esta pesquisa já não está disponível.");
    const { error } = await db.from("alumni_survey_responses").upsert(
      {
        school_id: membership.schoolId,
        survey_id: data.surveyId,
        alumni_id: profile.id,
        response_json: data.response as Json,
        submitted_at: now,
      },
      { onConflict: "survey_id,alumni_id" },
    );
    if (error) throw publicDatabaseError(error, "Não foi possível enviar a pesquisa.");
    return { ok: true };
  });
