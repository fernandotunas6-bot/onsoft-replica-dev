import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireMobileAcademicAccess } from "./authorization";

const COMMAND_ROLES: Record<string, "professor" | "aluno"> = {
  attendance: "professor",
  grade: "professor",
  plan: "professor",
  task: "professor",
  submission: "aluno",
  document: "aluno",
};

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
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(data.requestId))
      throw new Error("Identificador do pedido inválido.");
    const commandRole = COMMAND_ROLES[data.command?.type];
    if (!commandRole && data.command?.type !== "message")
      throw new Error("Tipo de comando inválido.");
    if (data.command.type !== "message" && commandRole !== data.role)
      throw new Error("Comando incompatível com o papel académico.");
    await requireMobileAcademicAccess(context.userId, data.schoolId, data.role, "write");
    throw new Error(
      "Escrita Mobile V4 indisponível: falta validação transaccional, idempotência e auditoria.",
    );
  });
