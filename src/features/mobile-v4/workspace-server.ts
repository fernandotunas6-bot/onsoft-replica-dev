import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireMobileAcademicAccess } from "./authorization";

/**
 * The institutional workspace is deliberately unavailable until the existing
 * academic data sources are mapped with server-side class and enrolment checks.
 * Returning empty lists here would falsely represent a real integration.
 */
export const getMobileV4Workspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { schoolId: string; role: "professor" | "aluno" }) => input)
  .handler(async ({ context, data }) => {
    if (!context?.userId) throw new Error("Unauthorized");
    await requireMobileAcademicAccess(context.userId, data.schoolId, data.role, "read");
    throw new Error(
      "Espaço académico Mobile V4 indisponível: falta validar o mapeamento de turmas, matrículas e aulas.",
    );
  });
