import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadSgaAdminClient, requireSgaWriterFor } from "@/integrations/supabase/sga-admin";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import type { ExistingStudentOption } from "./existing-student-match";

/** Searches the whole authorised school, independently of the list's current page. */
export const searchEnrollmentStudents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ query: z.string().trim().min(2).max(100) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<ExistingStudentOption[]> => {
    if (!context) throw new Error("Sessão inválida. Termine e volte a entrar.");
    const membership = await requireSgaWriterFor("pessoas", context.supabase, context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    // Remove PostgREST filter syntax and wildcard characters from user input.
    const term = data.query
      .replace(/[^\p{L}\p{N} @+/-]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (term.length < 2) return [];
    const db = await loadSgaAdminClient();
    const pattern = `%${term}%`;
    const people = await db
      .from("people")
      .select("id, full_name, students!inner(id)")
      .eq("students.school_id", membership.schoolId)
      .eq("school_id", membership.schoolId)
      .is("deleted_at", null)
      .or(`full_name.ilike.${pattern},national_id.ilike.${pattern}`)
      .order("full_name")
      .limit(30);
    if (people.error) throw publicDatabaseError(people.error, "Não foi possível procurar alunos.");
    const personIds = (people.data ?? []).map((p) => p.id);
    const [byPerson, byNumber] = await Promise.all([
      personIds.length
        ? db
            .from("students")
            .select("id, person_id, student_number, status")
            .eq("school_id", membership.schoolId)
            .in("person_id", personIds)
            .limit(20)
        : Promise.resolve({ data: [], error: null }),
      db
        .from("students")
        .select("id, person_id, student_number, status")
        .eq("school_id", membership.schoolId)
        .ilike("student_number", pattern)
        .order("student_number")
        .limit(20),
    ]);
    const lookupError = byPerson.error ?? byNumber.error;
    if (lookupError) {
      throw publicDatabaseError(lookupError, "Não foi possível procurar alunos.");
    }
    const students = [
      ...new Map(
        [...(byPerson.data ?? []), ...(byNumber.data ?? [])].map((s) => [s.id, s]),
      ).values(),
    ].slice(0, 20);
    if (!students.length) return [];
    const names = await db
      .from("people")
      .select("id, full_name")
      .eq("school_id", membership.schoolId)
      .is("deleted_at", null)
      .in(
        "id",
        students.map((s) => s.person_id),
      );
    if (names.error)
      throw publicDatabaseError(names.error, "Não foi possível ler os nomes dos alunos.");
    const nameById = new Map((names.data ?? []).map((p) => [p.id, p.full_name]));
    return students
      .filter((s) => nameById.has(s.person_id))
      .map((s) => ({
        id: s.id,
        full_name: nameById.get(s.person_id)!,
        registration_number: s.student_number,
        student_status: s.status,
      }))
      .sort((a, b) => a.full_name.localeCompare(b.full_name, "pt"));
  });
