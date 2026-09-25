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
  student: "Aluno",
  aluno: "Aluno",
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
    case "Aluno":
      return ["student", "aluno"];
    default:
      return [];
  }
}

export type SgaMembershipContext = {
  schoolId: string;
  membershipId: string;
  roleCode: string;
  appRole: ApplicationRole;
  allAppRoles: ApplicationRole[];
  roleName: string;
  schoolName?: string;
  schoolSlug?: string | null;
};

export type UserSchoolMembershipItem = {
  membershipId: string;
  schoolId: string;
  schoolName: string;
  schoolSlug: string | null;
  status: string;
  roleCode: string;
  roleName: string;
  appRole: ApplicationRole;
  allAppRoles: ApplicationRole[];
  isActive: boolean;
};

export async function listUserSchoolMemberships(
  client: SupabaseClient,
  userId: string,
): Promise<UserSchoolMembershipItem[]> {
  const db = sgaClient(client);
  const { data: memberships, error } = await db
    .from("school_memberships")
    .select("id, school_id, status, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[listUserSchoolMemberships] error querying memberships:", error);
    return [];
  }
  if (!memberships || memberships.length === 0) return [];

  const schoolIds = [...new Set(memberships.map((m: { school_id: string }) => m.school_id))];
  const membershipIds = memberships.map((m: { id: string }) => m.id);

  // Fetch school details
  let schoolsMap = new Map<string, { name: string; slug: string | null; status: string }>();
  if (schoolIds.length) {
    try {
      // O slug é do tenant, não da escola: `schools` não tem coluna `slug`. Com
      // ela no select, o PostgREST recusava a consulta inteira — e o `catch`
      // abaixo engolia o erro, deixando `schoolsMap` vazio. Consequência: nem o
      // slug nem o **nome** da escola chegavam ao contexto da conta, e quem lê
      // `schoolName`/`schoolSlug` recebia null desde sempre.
      const { data: schoolsData, error: schoolsError } = await db
        .from("schools")
        .select("id, name, status, tenants(slug)")
        .in("id", schoolIds);
      if (schoolsError) throw schoolsError;
      if (schoolsData) {
        schoolsMap = new Map(
          schoolsData.map(
            (s: {
              id: string;
              name: string;
              status: string;
              tenants?: { slug?: string | null } | { slug?: string | null }[] | null;
            }) => {
              const tenant = Array.isArray(s.tenants) ? s.tenants[0] : s.tenants;
              return [s.id, { name: s.name, slug: tenant?.slug ?? null, status: s.status }];
            },
          ),
        );
      }
    } catch (schoolError) {
      // Authorization must fail closed if a school is suspended or its status
      // cannot be checked; never silently replace a failed lookup with a name.
      console.error("[listUserSchoolMemberships] school lookup failed:", schoolError);
      return [];
    }
  }

  // Fetch member roles
  const memberRolesMap = new Map<string, string[]>();
  const allRoleIds: string[] = [];
  if (membershipIds.length) {
    try {
      const { data: mrData } = await db
        .from("member_roles")
        .select("membership_id, role_id")
        .in("membership_id", membershipIds);
      if (mrData) {
        for (const mr of mrData) {
          const list = memberRolesMap.get(mr.membership_id) ?? [];
          list.push(mr.role_id);
          memberRolesMap.set(mr.membership_id, list);
          allRoleIds.push(mr.role_id);
        }
      }
    } catch {
      /* ignore */
    }
  }

  // Fetch roles definitions
  let rolesMap = new Map<string, { code: string; name: string }>();
  if (allRoleIds.length) {
    try {
      const { data: rolesData } = await db
        .from("roles")
        .select("id, code, name")
        .in("id", [...new Set(allRoleIds)]);
      if (rolesData) {
        rolesMap = new Map(
          rolesData.map((r: { id: string; code: string; name: string }) => [r.id, r]),
        );
      }
    } catch {
      /* ignore */
    }
  }

  return memberships.map((m: { id: string; school_id: string; status: string }) => {
    const schoolInfo = schoolsMap.get(m.school_id);
    const roleIds = memberRolesMap.get(m.id) ?? [];
    const roles = roleIds.map((rid) => rolesMap.get(rid)).filter(Boolean) as Array<{
      code: string;
      name: string;
    }>;

    let roleCode = "member";
    let roleName = "Utilizador";
    const allAppRoles: ApplicationRole[] = [];

    if (roles.length > 0) {
      const preferred =
        roles.find((r) => ["owner", "admin", "administrador"].includes(r.code)) ?? roles[0];
      if (preferred) {
        roleCode = preferred.code;
        roleName = preferred.name;
      }
      for (const r of roles) {
        const appR = mapSgaRoleCode(r.code);
        if (!allAppRoles.includes(appR)) allAppRoles.push(appR);
      }
    }

    const primaryAppRole = mapSgaRoleCode(roleCode);
    if (!allAppRoles.includes(primaryAppRole)) {
      allAppRoles.push(primaryAppRole);
    }

    return {
      membershipId: m.id,
      schoolId: m.school_id,
      schoolName: schoolInfo?.name ?? "Instituição Escolar",
      schoolSlug: schoolInfo?.slug ?? null,
      status: m.status,
      roleCode,
      roleName,
      appRole: primaryAppRole,
      allAppRoles,
      isActive: m.status === "active" && schoolInfo?.status === "active",
    };
  });
}

export async function resolveSgaMembership(
  client: SupabaseClient,
  userId: string,
  preferredSchoolId?: string | null,
): Promise<SgaMembershipContext | null> {
  const allMemberships = await listUserSchoolMemberships(client, userId);
  if (!allMemberships || allMemberships.length === 0) return null;

  const activeMemberships = allMemberships.filter((m) => m.isActive);
  if (activeMemberships.length === 0) return null;

  const selected =
    (preferredSchoolId ? activeMemberships.find((m) => m.schoolId === preferredSchoolId) : null) ??
    activeMemberships[0];

  if (!selected) return null;

  return {
    schoolId: selected.schoolId,
    membershipId: selected.membershipId,
    roleCode: selected.roleCode,
    roleName: selected.roleName,
    appRole: selected.appRole,
    allAppRoles: selected.allAppRoles,
    schoolName: selected.schoolName,
    schoolSlug: selected.schoolSlug,
  };
}
