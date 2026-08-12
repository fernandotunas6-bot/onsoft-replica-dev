import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApplicationRole } from "@/features/auth/access-policy";

/** Untyped client for the remote SGA schema (diverges from local generated types). */
export function sgaClient(client: SupabaseClient) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- remote SGA schema has no generated types
  return client as SupabaseClient<any>;
}

const roleCodeToAppRole: Record<string, ApplicationRole> = {
  owner: "Administrador",
  admin: "Administrador",
  administrador: "Administrador",
  secretary: "Secretaria",
  secretaria: "Secretaria",
  treasury: "Tesouraria",
  tesouraria: "Tesouraria",
  finance: "Tesouraria",
  teacher: "Professor",
  professor: "Professor",
  guardian: "Encarregado",
  encarregado: "Encarregado",
  parent: "Encarregado",
};

export function mapSgaRoleCode(code: string | null | undefined): ApplicationRole {
  if (!code) return "Utilizador";
  return roleCodeToAppRole[code.trim().toLowerCase()] ?? "Utilizador";
}

export function mapAppRoleToSgaCodes(role: ApplicationRole): string[] {
  switch (role) {
    case "Administrador":
      return ["owner", "admin", "administrador"];
    case "Secretaria":
      return ["secretary", "secretaria"];
    case "Tesouraria":
      return ["treasury", "tesouraria", "finance"];
    case "Professor":
      return ["teacher", "professor"];
    case "Encarregado":
      return ["guardian", "encarregado", "parent"];
    default:
      return [];
  }
}

export type SgaMembershipContext = {
  schoolId: string;
  membershipId: string;
  roleCode: string;
  appRole: ApplicationRole;
  roleName: string;
};

export async function resolveSgaMembership(
  client: SupabaseClient,
  userId: string,
): Promise<SgaMembershipContext | null> {
  const db = sgaClient(client);
  const { data: membership, error } = await db
    .from("school_memberships")
    .select("id, school_id, status")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!membership) return null;

  const { data: memberRoles, error: mrError } = await db
    .from("member_roles")
    .select("role_id")
    .eq("membership_id", membership.id);
  if (mrError) throw mrError;

  const roleIds = (memberRoles ?? []).map((row: { role_id: string }) => row.role_id);
  let roleCode = "member";
  let roleName = "Utilizador";
  if (roleIds.length) {
    const { data: roles, error: rolesError } = await db
      .from("roles")
      .select("id, code, name")
      .in("id", roleIds);
    if (rolesError) throw rolesError;
    const preferred =
      (roles ?? []).find((role: { code: string }) =>
        ["owner", "admin", "administrador"].includes(role.code),
      ) ?? (roles ?? [])[0];
    if (preferred) {
      roleCode = preferred.code;
      roleName = preferred.name;
    }
  }

  return {
    schoolId: membership.school_id,
    membershipId: membership.id,
    roleCode,
    roleName,
    appRole: mapSgaRoleCode(roleCode),
  };
}
