import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { listUserSchoolMemberships } from "@/integrations/supabase/sga";

type MobileRole = "professor" | "aluno";
type MobilePermission =
  | "academic.read"
  | "attendance.write"
  | "grades.write"
  | "tasks.write"
  | "submissions.write"
  | "messages.write"
  | "documents.request";

type MobileMembership = {
  schoolId: string;
  schoolName: string;
  active: boolean;
  roles: MobileRole[];
  permissions: MobilePermission[];
};

export function mapMobileMemberships(
  memberships: Awaited<ReturnType<typeof listUserSchoolMemberships>>,
): MobileMembership[] {
  return memberships
    .filter((item) => item.isActive && item.schoolId.trim() && item.schoolName.trim())
    .map((item) => {
      const roles: MobileRole[] = [];
      const permissions: MobilePermission[] = [];
      const assigned = item.allAppRoles;
      if (assigned.includes("Professor")) {
        roles.push("professor");
        permissions.push(
          "academic.read",
          "attendance.write",
          "grades.write",
          "tasks.write",
          "messages.write",
        );
      }
      if (assigned.includes("Aluno")) {
        roles.push("aluno");
        for (const permission of [
          "academic.read",
          "submissions.write",
          "messages.write",
          "documents.request",
        ] as const) {
          if (!permissions.includes(permission)) permissions.push(permission);
        }
      }
      return {
        schoolId: item.schoolId,
        schoolName: item.schoolName,
        active: true,
        roles,
        permissions,
      };
    })
    .filter((item) => item.roles.length > 0);
}

/**
 * Uses the existing verified JWT + MFA middleware; never trusts a user ID or
 * membership list provided by the mobile client. The HTTP adapter must not
 * expose this server function without the same authentication requirements.
 */
export const getMobileV4Session = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!context?.userId) throw new Error("Unauthorized");
    const db = await loadSgaAdminClient();
    const memberships = mapMobileMemberships(
      await listUserSchoolMemberships(db, context.userId),
    );
    const { data: profile, error } = await db
      .from("profiles")
      .select("full_name")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error("Não foi possível confirmar o perfil institucional.");
    const name = String(profile?.full_name ?? "").trim();
    if (!name) throw new Error("Perfil institucional sem nome válido.");
    return {
      userId: context.userId,
      name,
      memberships,
      mode: "api" as const,
    };
  });
