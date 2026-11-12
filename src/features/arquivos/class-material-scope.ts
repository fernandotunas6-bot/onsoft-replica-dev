import type { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { publicDatabaseError } from "@/integrations/supabase/server-error";

type AdminDb = Awaited<ReturnType<typeof loadSgaAdminClient>>;

/**
 * Regra única para materiais de turma: gestão institucional ou uma atribuição
 * docente ACTIVA na escola e turma pedidas. Nunca inferir por nome ou e-mail.
 * O File Picker e a mutação final devem chamar a mesma guarda.
 */
export async function assertClassMaterialScope(
  db: AdminDb,
  input: {
    schoolId: string;
    userId: string;
    classGroupId: string;
    roles: readonly string[];
  },
): Promise<void> {
  if (input.roles.includes("Administrador") || input.roles.includes("Secretaria")) return;
  if (!input.roles.includes("Professor")) throw new Error("Sem acesso aos materiais desta turma.");

  const { data: direct, error: directError } = await db
    .from("teachers")
    .select("id")
    .eq("school_id", input.schoolId)
    .eq("user_id", input.userId)
    .eq("status", "active");
  if (directError) {
    throw publicDatabaseError(directError, "Não foi possível validar o professor desta turma.");
  }

  // Algumas contas antigas ligam-se ao professor através da pessoa, não de
  // teachers.user_id. Usar APENAS a ligação user_id autenticada e escola activa.
  const { data: person, error: personError } = await db
    .from("people")
    .select("id")
    .eq("school_id", input.schoolId)
    .eq("user_id", input.userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (personError) {
    throw publicDatabaseError(personError, "Não foi possível validar a identidade docente.");
  }

  let linked: Array<{ id: string }> = [];
  if (person?.id) {
    const { data, error } = await db
      .from("teachers")
      .select("id")
      .eq("school_id", input.schoolId)
      .eq("person_id", String(person.id))
      .eq("status", "active");
    if (error) {
      throw publicDatabaseError(error, "Não foi possível validar a ligação ao professor.");
    }
    linked = data ?? [];
  }

  const ids = [
    ...new Set([...(direct ?? []), ...linked].map((row) => String(row.id)).filter(Boolean)),
  ];
  if (!ids.length) throw new Error("Sem atribuição docente activa nesta escola.");

  const { data: assignments, error: assignmentError } = await db
    .from("class_subjects")
    .select("id")
    .eq("school_id", input.schoolId)
    .eq("class_group_id", input.classGroupId)
    .eq("status", "active")
    .in("teacher_id", ids)
    .limit(1);
  if (assignmentError) {
    throw publicDatabaseError(assignmentError, "Não foi possível validar a turma atribuída.");
  }
  if (!assignments?.length) throw new Error("Esta turma não está atribuída ao professor.");
}
