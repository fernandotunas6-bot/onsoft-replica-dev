import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import {
  loadSgaAdminClient,
  requireSgaWriter,
  resolveSgaMembershipAdmin,
} from "@/integrations/supabase/sga-admin";

const listAlumniInputSchema = z.object({
  query: z.string().trim().max(120).optional().default(""),
  graduationYear: z.number().int().min(1950).max(2100).optional(),
  employmentStatus: z
    .enum(["employed", "self_employed", "student", "seeking", "unavailable", "unknown"])
    .optional(),
  mentoringOnly: z.boolean().optional().default(false),
  offset: z.number().int().min(0).optional().default(0),
  limit: z.number().int().min(1).max(200).optional().default(50),
});

const upsertAlumniInputSchema = z.object({
  studentId: z.string().uuid(),
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
  linkedinUrl: z.string().trim().url().nullable().optional(),
  websiteUrl: z.string().trim().url().nullable().optional(),
  skills: z.array(z.string().trim().max(80)).max(30).optional(),
  interests: z.array(z.string().trim().max(80)).max(30).optional(),
  availableForMentoring: z.boolean().optional(),
  seekingMentor: z.boolean().optional(),
  openToOpportunities: z.boolean().optional(),
  directoryVisibility: z.enum(["private", "school", "alumni"]).optional(),
  contactConsent: z.boolean().optional(),
});

type AlumniListRow = {
  id: string;
  student_id: string;
  person_id: string;
  student_number: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  photo_url: string | null;
  graduation_year: number | null;
  graduation_grade: string | null;
  graduation_course: string | null;
  headline: string | null;
  current_company: string | null;
  current_role: string | null;
  employment_status: string;
  industry: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
  available_for_mentoring: boolean;
  seeking_mentor: boolean;
  open_to_opportunities: boolean;
  verified_at: string | null;
  last_engagement_at: string | null;
};

async function resolveContext(userId: string) {
  const membership = await resolveSgaMembershipAdmin(userId);
  if (!membership) throw new Error("Sem membership activa nesta escola.");
  const db = await loadSgaAdminClient();
  return { membership, db };
}

export const listAlumni = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => listAlumniInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const { membership, db } = await resolveContext(context.userId);

    let profileQuery = db
      .from("alumni_profiles")
      .select(
        "id, student_id, person_id, graduation_year, graduation_grade, graduation_course, headline, current_company, current_role, employment_status, industry, city, province, country, available_for_mentoring, seeking_mentor, open_to_opportunities, verified_at, last_engagement_at",
      )
      .eq("school_id", membership.schoolId)
      .order("graduation_year", { ascending: false, nullsFirst: false })
      .range(data.offset, data.offset + data.limit - 1);

    if (data.graduationYear) profileQuery = profileQuery.eq("graduation_year", data.graduationYear);
    if (data.employmentStatus) profileQuery = profileQuery.eq("employment_status", data.employmentStatus);
    if (data.mentoringOnly) profileQuery = profileQuery.eq("available_for_mentoring", true);

    const { data: profiles, error } = await profileQuery;
    if (error) throw publicDatabaseError(error, "Não foi possível carregar a rede Alumni.");

    const profileRows = profiles ?? [];
    const studentIds = profileRows.map((row: { student_id: string }) => row.student_id);
    const personIds = profileRows.map((row: { person_id: string }) => row.person_id);

    const [{ data: students }, { data: people }] = await Promise.all([
      studentIds.length
        ? db
            .from("students")
            .select("id, student_number")
            .eq("school_id", membership.schoolId)
            .in("id", studentIds)
        : Promise.resolve({ data: [] as Array<{ id: string; student_number: string }> }),
      personIds.length
        ? db
            .from("people")
            .select("id, full_name, email, phone, photo_url")
            .eq("school_id", membership.schoolId)
            .in("id", personIds)
        : Promise.resolve({
            data: [] as Array<{
              id: string;
              full_name: string;
              email: string | null;
              phone: string | null;
              photo_url: string | null;
            }>,
          }),
    ]);

    const studentById = new Map((students ?? []).map((row) => [row.id, row]));
    const personById = new Map((people ?? []).map((row) => [row.id, row]));
    const query = data.query.toLowerCase();

    const result: AlumniListRow[] = profileRows.map((profile) => {
      const student = studentById.get(profile.student_id);
      const person = personById.get(profile.person_id);
      return {
        ...profile,
        student_number: student?.student_number ?? "—",
        full_name: person?.full_name ?? "—",
        email: person?.email ?? null,
        phone: person?.phone ?? null,
        photo_url: person?.photo_url ?? null,
      } as AlumniListRow;
    });

    if (!query) return result;
    return result.filter((row) =>
      [
        row.full_name,
        row.student_number,
        row.email ?? "",
        row.current_company ?? "",
        row.current_role ?? "",
        row.industry ?? "",
        row.city ?? "",
        row.province ?? "",
      ].some((value) => value.toLowerCase().includes(query)),
    );
  });

export const getAlumniOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const { membership, db } = await resolveContext(context.userId);

    const [{ count: total }, { count: mentors }, { count: opportunities }, { data: profiles }] =
      await Promise.all([
        db
          .from("alumni_profiles")
          .select("id", { count: "exact", head: true })
          .eq("school_id", membership.schoolId),
        db
          .from("alumni_profiles")
          .select("id", { count: "exact", head: true })
          .eq("school_id", membership.schoolId)
          .eq("available_for_mentoring", true),
        db
          .from("alumni_opportunities")
          .select("id", { count: "exact", head: true })
          .eq("school_id", membership.schoolId)
          .eq("status", "published"),
        db
          .from("alumni_profiles")
          .select("employment_status, open_to_opportunities, verified_at, graduation_year")
          .eq("school_id", membership.schoolId),
      ]);

    const rows = profiles ?? [];
    const employed = rows.filter((row) =>
      ["employed", "self_employed"].includes(row.employment_status),
    ).length;
    const verified = rows.filter((row) => Boolean(row.verified_at)).length;
    const openToOpportunities = rows.filter((row) => row.open_to_opportunities).length;
    const cohorts = [...new Set(rows.map((row) => row.graduation_year).filter(Boolean))].length;

    return {
      total: total ?? 0,
      employed,
      mentors: mentors ?? 0,
      opportunities: opportunities ?? 0,
      verified,
      openToOpportunities,
      cohorts,
      employmentRate: rows.length ? Math.round((employed / rows.length) * 100) : 0,
      verificationRate: rows.length ? Math.round((verified / rows.length) * 100) : 0,
    };
  });

export const bootstrapGraduatedStudents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await requireSgaWriter(context.userId);
    const db = await loadSgaAdminClient();

    const { data: graduated, error } = await db
      .from("students")
      .select("id, person_id")
      .eq("school_id", membership.schoolId)
      .eq("status", "graduated");
    if (error) throw publicDatabaseError(error, "Não foi possível localizar alunos concluídos.");

    if (!graduated?.length) return { created: 0 };

    const studentIds = graduated.map((row) => row.id);
    const { data: existing } = await db
      .from("alumni_profiles")
      .select("student_id")
      .eq("school_id", membership.schoolId)
      .in("student_id", studentIds);
    const existingIds = new Set((existing ?? []).map((row) => row.student_id));

    const missing = graduated.filter((row) => !existingIds.has(row.id));
    if (!missing.length) return { created: 0 };

    const { error: insertError } = await db.from("alumni_profiles").insert(
      missing.map((row) => ({
        school_id: membership.schoolId,
        student_id: row.id,
        person_id: row.person_id,
      })),
    );
    if (insertError) throw publicDatabaseError(insertError, "Não foi possível activar os Alumni.");
    return { created: missing.length };
  });

export const upsertAlumniProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => upsertAlumniInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await requireSgaWriter(context.userId);
    const db = await loadSgaAdminClient();

    const { data: student, error: studentError } = await db
      .from("students")
      .select("id, person_id")
      .eq("school_id", membership.schoolId)
      .eq("id", data.studentId)
      .maybeSingle();
    if (studentError) throw publicDatabaseError(studentError, "Não foi possível validar o ex-aluno.");
    if (!student) throw new Error("Aluno não encontrado nesta escola.");

    const payload = {
      school_id: membership.schoolId,
      student_id: student.id,
      person_id: student.person_id,
      headline: data.headline,
      biography: data.biography,
      current_company: data.currentCompany,
      current_role: data.currentRole,
      employment_status: data.employmentStatus,
      industry: data.industry,
      city: data.city,
      province: data.province,
      country: data.country,
      linkedin_url: data.linkedinUrl,
      website_url: data.websiteUrl,
      skills: data.skills,
      interests: data.interests,
      available_for_mentoring: data.availableForMentoring,
      seeking_mentor: data.seekingMentor,
      open_to_opportunities: data.openToOpportunities,
      directory_visibility: data.directoryVisibility,
      contact_consent: data.contactConsent,
      updated_at: new Date().toISOString(),
    };

    const { data: profile, error } = await db
      .from("alumni_profiles")
      .upsert(payload, { onConflict: "school_id,student_id" })
      .select("id")
      .single();
    if (error) throw publicDatabaseError(error, "Não foi possível guardar o perfil Alumni.");
    return profile;
  });
