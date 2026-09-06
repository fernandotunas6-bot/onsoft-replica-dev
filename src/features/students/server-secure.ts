import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import {
  loadSgaAdminClient,
  resolveSgaMembershipAdmin,
} from "@/integrations/supabase/sga-admin";
import {
  getStudentInputSchema,
  listEnrollmentsInputSchema,
  searchStudentsInputSchema,
} from "./schemas";
import * as legacy from "./server";

// Preserve all existing mutations and secondary reads. The explicit exports below
// override sensitive legacy reads for every @/.../students/server import.
export * from "./server";

async function resolveContextualStudentIds(params: {
  schoolId: string;
  userId: string;
  appRole: string;
}): Promise<Set<string> | null> {
  if (params.appRole === "Administrador" || params.appRole === "Secretaria") {
    return null; // full school directory, still tenant-scoped by the legacy query
  }

  const db = await loadSgaAdminClient();

  if (params.appRole === "Aluno") {
    const { data: people, error: peopleError } = await db
      .from("people")
      .select("id")
      .eq("school_id", params.schoolId)
      .eq("user_id", params.userId);
    if (peopleError) {
      throw publicDatabaseError(peopleError, "Não foi possível validar o perfil do aluno.");
    }
    const personIds = (people ?? []).map((row) => String(row.id));
    if (!personIds.length) return new Set();

    const { data: students, error: studentsError } = await db
      .from("students")
      .select("id")
      .eq("school_id", params.schoolId)
      .in("person_id", personIds);
    if (studentsError) {
      throw publicDatabaseError(studentsError, "Não foi possível validar o aluno da conta.");
    }
    return new Set((students ?? []).map((row) => String(row.id)));
  }

  if (params.appRole === "Encarregado") {
    const { data: people, error: peopleError } = await db
      .from("people")
      .select("id")
      .eq("school_id", params.schoolId)
      .eq("user_id", params.userId);
    if (peopleError) {
      throw publicDatabaseError(peopleError, "Não foi possível validar o encarregado.");
    }
    const guardianPersonIds = (people ?? []).map((row) => String(row.id));
    if (!guardianPersonIds.length) return new Set();

    const { data: links, error: linksError } = await db
      .from("student_guardians")
      .select("student_id")
      .eq("school_id", params.schoolId)
      .in("guardian_person_id", guardianPersonIds);
    if (linksError) {
      throw publicDatabaseError(linksError, "Não foi possível validar os educandos vinculados.");
    }
    return new Set((links ?? []).map((row) => String(row.student_id)));
  }

  // Tesouraria, Professor and Utilizador must use their dedicated finance/pedagogy
  // surfaces rather than the personal-data student directory.
  throw new Error("Este perfil não tem acesso ao directório pessoal de alunos.");
}

export const searchStudents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => searchStudentsInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem membership activa nesta escola.");

    const allowedIds = await resolveContextualStudentIds({
      schoolId: membership.schoolId,
      userId: context.userId,
      appRole: membership.appRole,
    });

    if (allowedIds === null) {
      return legacy.searchStudents({ data });
    }
    if (allowedIds.size === 0) return [];

    // Contextual users have only a small set of linked students. Query one bounded
    // school page, then filter before anything leaves the server. Pagination is
    // applied after authorization, avoiding cross-student disclosure.
    const candidates = await legacy.searchStudents({
      data: { query: data.query, limit: 100, offset: 0 },
    });
    const authorized = candidates.filter((row) => allowedIds.has(String(row.id)));
    return authorized.slice(data.offset, data.offset + data.limit);
  });

export const getStudentProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => getStudentInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem membership activa nesta escola.");

    const allowedIds = await resolveContextualStudentIds({
      schoolId: membership.schoolId,
      userId: context.userId,
      appRole: membership.appRole,
    });
    if (allowedIds !== null && !allowedIds.has(data.id)) {
      throw new Error("Não tem autorização para consultar este aluno.");
    }

    return legacy.getStudentProfile({ data });
  });

export const listEnrollments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => listEnrollmentsInputSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem membership activa nesta escola.");

    const allowedIds = await resolveContextualStudentIds({
      schoolId: membership.schoolId,
      userId: context.userId,
      appRole: membership.appRole,
    });
    if (allowedIds === null) return legacy.listEnrollments({ data });
    if (!allowedIds.size) return [];

    // The legacy function is tenant-scoped but broad. Ask for its bounded maximum,
    // then reduce to the authenticated student's/guardian's authorized set before return.
    const rows = await legacy.listEnrollments({
      data: { ...data, limit: 250 },
    });
    return rows.filter((row) => allowedIds.has(String(row.student_id))).slice(0, data.limit);
  });
