import { loadSgaAdminClient, assertModuleNotBlocked } from "@/integrations/supabase/sga-admin";
import { listUserSchoolMemberships } from "@/integrations/supabase/sga";

export type MobileAcademicRole = "professor" | "aluno";

/**
 * Never infer the tenant from the user's first school or a client-provided
 * profile. Resolve the exact requested school from verified active membership.
 * Admin/service-role clients must not bypass these checks.
 */
export async function requireMobileAcademicAccess(
  userId: string,
  schoolId: string,
  role: MobileAcademicRole,
  mode: "read" | "write" = "read",
) {
  if (!userId.trim() || !schoolId.trim()) throw new Error("Sessão ou escola inválida.");
  const db = await loadSgaAdminClient();
  const memberships = await listUserSchoolMemberships(db, userId);
  const membership = memberships.find(
    (item) => item.schoolId === schoolId && item.isActive,
  );
  if (!membership) throw new Error("Sem vínculo activo nesta escola.");
  const requiredRole = role === "professor" ? "Professor" : "Aluno";
  if (!membership.allAppRoles.includes(requiredRole)) {
    throw new Error("Papel académico não autorizado nesta escola.");
  }
  await assertModuleNotBlocked(schoolId, userId, "pedagogica", mode);
  return { db, membership };
}
