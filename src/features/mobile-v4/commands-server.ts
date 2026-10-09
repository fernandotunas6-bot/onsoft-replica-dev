import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireMobileAcademicAccess } from "./authorization";

type MobileCommandRequest = {
  schoolId: string;
  role: "professor" | "aluno";
  requestId: string;
  command: { type: string };
};

/**
 * This is a guarded integration seam, NOT an enabled write endpoint.
 * Before accepting any command the implementation must load the authoritative
 * class/period state, check operation-specific grants, write atomically and
 * persist an audit record with an idempotency key.
 */
export const executeMobileV4Command = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: MobileCommandRequest) => input)
  .handler(async ({ context, data }) => {
    if (!context?.userId) throw new Error("Unauthorized");
    if (!data.requestId || !data.command?.type) throw new Error("Comando inválido.");
    await requireMobileAcademicAccess(context.userId, data.schoolId, data.role, "write");
    throw new Error(
      "Escrita Mobile V4 indisponível: falta validação transaccional, idempotência e auditoria.",
    );
  });
