import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { loadSgaAdminClient, requireSgaWriterFor } from "@/integrations/supabase/sga-admin";

const alumniDocumentsInputSchema = z.object({ alumniId: z.string().uuid() });

export const getAlumniDocumentWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => alumniDocumentsInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Sessão inválida.");
    const membership = await requireSgaWriterFor("pessoas", context.userId, [
      "Administrador",
      "Secretaria",
    ]);
    const db = await loadSgaAdminClient();

    const { data: alumni, error: alumniError } = await db
      .from("alumni_profiles")
      .select("id, student_id, person_id, graduation_year, graduation_course, graduation_grade")
      .eq("school_id", membership.schoolId)
      .eq("id", data.alumniId)
      .maybeSingle();
    if (alumniError) throw publicDatabaseError(alumniError, "Não foi possível validar o Alumni.");
    if (!alumni) throw new Error("Alumni não encontrado nesta escola.");

    const [
      { data: person },
      { data: student },
      { data: requests, error: requestsError },
      { data: templates },
    ] = await Promise.all([
      db
        .from("people")
        .select("id, full_name, photo_url")
        .eq("school_id", membership.schoolId)
        .eq("id", alumni.person_id)
        .maybeSingle(),
      db
        .from("students")
        .select("id, student_number, status")
        .eq("school_id", membership.schoolId)
        .eq("id", alumni.student_id)
        .maybeSingle(),
      db
        .from("document_requests")
        .select("id, template_id, request_type, status, purpose, created_at, updated_at")
        .eq("school_id", membership.schoolId)
        .eq("student_id", alumni.student_id)
        .order("created_at", { ascending: false })
        .limit(100),
      db
        .from("document_templates")
        .select("id, name, document_type, status")
        .eq("school_id", membership.schoolId)
        .eq("status", "active")
        .order("name"),
    ]);
    if (requestsError)
      throw publicDatabaseError(
        requestsError,
        "Não foi possível carregar os documentos do Alumni.",
      );

    const templateById = new Map((templates ?? []).map((template) => [template.id, template]));
    return {
      alumni: {
        id: alumni.id,
        studentId: alumni.student_id,
        fullName: person?.full_name ?? "Alumni",
        photoUrl: person?.photo_url ?? null,
        studentNumber: student?.student_number ?? "—",
        graduationYear: alumni.graduation_year,
        graduationCourse: alumni.graduation_course || alumni.graduation_grade,
      },
      requests: (requests ?? []).map((request) => ({
        id: request.id,
        status: request.status,
        purpose: request.purpose,
        createdAt: request.created_at,
        updatedAt: request.updated_at,
        templateName: request.template_id
          ? (templateById.get(request.template_id)?.name ?? request.request_type ?? "Documento")
          : (request.request_type ?? "Documento"),
        documentType: request.template_id
          ? (templateById.get(request.template_id)?.document_type ?? request.request_type)
          : request.request_type,
      })),
      availableTemplates: templates ?? [],
    };
  });
