import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { loadSgaAdminClient, requireSgaWriterFor } from "@/integrations/supabase/sga-admin";
import { rankMentors } from "./matching";

const recommendationInputSchema = z.object({
  alumniId: z.string().uuid(),
  limit: z.number().int().min(1).max(25).default(10),
});

export const getAlumniMentorRecommendations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => recommendationInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida.");
    const membership = await requireSgaWriterFor("pessoas", context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();

    const { data: target, error: targetError } = await db
      .from("alumni_profiles")
      .select(
        "id, graduation_year, industry, province, city, skills, interests, available_for_mentoring, seeking_mentor",
      )
      .eq("school_id", membership.schoolId)
      .eq("id", data.alumniId)
      .maybeSingle();
    if (targetError) throw publicDatabaseError(targetError, "Não foi possível carregar o Alumni.");
    if (!target) throw new Error("Alumni não encontrado nesta escola.");

    const { data: mentors, error: mentorsError } = await db
      .from("alumni_profiles")
      .select(
        "id, person_id, graduation_year, industry, province, city, skills, interests, available_for_mentoring, seeking_mentor, current_company, current_role, headline, verified_at",
      )
      .eq("school_id", membership.schoolId)
      .eq("available_for_mentoring", true)
      .neq("id", data.alumniId)
      .limit(250);
    if (mentorsError)
      throw publicDatabaseError(mentorsError, "Não foi possível carregar os mentores Alumni.");

    const ranked = rankMentors(
      {
        id: target.id,
        graduationYear: target.graduation_year,
        industry: target.industry,
        province: target.province,
        city: target.city,
        skills: target.skills,
        interests: target.interests,
        availableForMentoring: target.available_for_mentoring,
        seekingMentor: target.seeking_mentor,
      },
      (mentors ?? []).map((mentor) => ({
        id: mentor.id,
        graduationYear: mentor.graduation_year,
        industry: mentor.industry,
        province: mentor.province,
        city: mentor.city,
        skills: mentor.skills,
        interests: mentor.interests,
        availableForMentoring: mentor.available_for_mentoring,
        seekingMentor: mentor.seeking_mentor,
      })),
      data.limit,
    );

    const mentorRows = new Map((mentors ?? []).map((row) => [row.id, row]));
    const personIds = ranked
      .map((row) => mentorRows.get(row.mentor.id)?.person_id)
      .filter((value): value is string => Boolean(value));
    const { data: people } = personIds.length
      ? await db
          .from("people")
          .select("id, full_name, photo_url")
          .eq("school_id", membership.schoolId)
          .in("id", personIds)
      : { data: [] };
    const peopleById = new Map((people ?? []).map((row) => [row.id, row]));

    return ranked.map((row) => {
      const mentor = mentorRows.get(row.mentor.id)!;
      const person = peopleById.get(mentor.person_id);
      return {
        alumniId: mentor.id,
        fullName: person?.full_name ?? "Alumni",
        photoUrl: person?.photo_url ?? null,
        currentRole: mentor.current_role,
        currentCompany: mentor.current_company,
        headline: mentor.headline,
        graduationYear: mentor.graduation_year,
        industry: mentor.industry,
        province: mentor.province,
        city: mentor.city,
        verifiedAt: mentor.verified_at,
        score: row.score,
        reasons: row.reasons,
      };
    });
  });
