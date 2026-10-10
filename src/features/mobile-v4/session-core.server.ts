import { loadSgaAdminClient, assertModuleNotBlocked } from "@/integrations/supabase/sga-admin";
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
        permissions.push("academic.read");
      }
      if (assigned.includes("Aluno")) {
        roles.push("aluno");
        for (const permission of ["academic.read"] as const) {
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

export async function loadMobileV4Session(userId: string) {
  const db = await loadSgaAdminClient();
  const memberships = mapMobileMemberships(
    await listUserSchoolMemberships(db, userId, { strict: true }),
  );
  // The UI advertises no write permission until the corresponding atomic
  // command is available. Module grants are still checked on every request.
  for (const membership of memberships) {
    await assertModuleNotBlocked(membership.schoolId, userId, "pedagogica", "read");
  }
  const { data: profile, error } = await db
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error("Não foi possível confirmar o perfil institucional.");
  const name = String(profile?.full_name ?? "").trim();
  if (!name) throw new Error("Perfil institucional sem nome válido.");
  return {
    userId: userId,
    name,
    memberships,
    mode: "api" as const,
  };
}
