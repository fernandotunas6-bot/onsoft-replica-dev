import { loadSgaAdminClient, assertModuleNotBlocked } from "@/integrations/supabase/sga-admin";
import { MobileApiError } from "./errors";
import { mobileScopeSchema } from "./schemas";
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
  mobileScopeSchema.parse({ schoolId, role });
  if (!userId.trim()) throw new MobileApiError(401, "SESSION_REQUIRED");
  const db = await loadSgaAdminClient();
  const { data: activeRow, error: activeError } = await db
    .from("school_memberships")
    .select("id")
    .eq("user_id", userId)
    .eq("school_id", schoolId)
    .eq("status", "active")
    .maybeSingle();
  if (activeError) throw new MobileApiError(503, "MEMBERSHIP_LOOKUP_UNAVAILABLE");
  if (!activeRow) throw new MobileApiError(403, "SCHOOL_FORBIDDEN");
  const memberships = await listUserSchoolMemberships(db, userId, { strict: true });
  const membership = memberships.find(
    (item) => item.schoolId === schoolId && item.membershipId === activeRow.id && item.isActive,
  );
  if (!membership) throw new MobileApiError(403, "SCHOOL_FORBIDDEN");
  const requiredRole = role === "professor" ? "Professor" : "Aluno";
  if (!membership.allAppRoles.includes(requiredRole)) {
    throw new MobileApiError(403, "ROLE_FORBIDDEN");
  }
  try {
    await assertModuleNotBlocked(schoolId, userId, "pedagogica", mode);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const forbidden =
      /retirado|só tem leitura|suspensa|experimental terminou|cancelada|arquivada/.test(message);
    throw new MobileApiError(
      forbidden ? 403 : 503,
      forbidden ? "MODULE_FORBIDDEN" : "GRANTS_UNAVAILABLE",
    );
  }
  return { db, membership };
}
