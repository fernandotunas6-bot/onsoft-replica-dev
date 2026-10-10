import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { ApplicationRole } from "@/features/auth/access-policy";

/**
 * Cliente do SGA com os tipos gerados da produção (`types.ts`, regenerado a partir
 * do esquema real). Até 29/09 devolvia `SupabaseClient<any>`: um nome de coluna
 * errado, uma coluna NOT NULL em falta ou um estado fora do CHECK passavam sem erro
 * e só falhavam na base — foi assim que Acessos, o estorno PayFlow e três
 * importadores ficaram partidos sem ninguém dar por isso.
 */
export function sgaClient(client: SupabaseClient) {
  return client as unknown as SupabaseClient<Database>;
}

/**
 * Para operações sobre uma tabela escolhida em tempo de execução (por exemplo, a
 * reversão de uma importação, que percorre a auditoria e desfaz em cada tabela):
 * aí não há tipo possível, por isso o cliente perde-o de propósito — e só aí.
 */
export function dynamicTablesClient(db: SupabaseClient<Database>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- o nome da tabela só se sabe em runtime
  return db as unknown as SupabaseClient<any>;
}

type SgaFunctions = Database["public"]["Functions"];

/**
 * Argumentos de uma RPC, aceitando `null`. O gerador de tipos do Supabase declara
 * todos os argumentos de funções Postgres como não nulos, mas a base aceita NULL
 * (e as funções do SGA contam com isso). Os nomes e os tipos continuam verificados.
 */
export function rpcArgs<F extends keyof SgaFunctions>(
  _fn: F,
  args: { [K in keyof SgaFunctions[F]["Args"]]: SgaFunctions[F]["Args"][K] | null },
): SgaFunctions[F]["Args"] {
  return args as SgaFunctions[F]["Args"];
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
  options: { strict?: boolean } = {},
): Promise<UserSchoolMembershipItem[]> {
  const db = sgaClient(client);
  const { data: memberships, error } = await db
    .from("school_memberships")
    .select("id, school_id, status, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    if (options.strict) throw new Error("Não foi possível confirmar os vínculos institucionais.");
    console.error("[listUserSchoolMemberships] error querying memberships:", error);
    return [];
  }
  if (!memberships || memberships.length === 0) return [];

  const schoolIds = [...new Set(memberships.map((m: { school_id: string }) => m.school_id))];
  const membershipIds = memberships.map((m: { id: string }) => m.id);

  // Fetch school details
  let schoolsMap = new Map<string, { name: string; slug: string | null }>();
  if (schoolIds.length) {
    try {
      // O slug é do tenant, não da escola: `schools` não tem coluna `slug`. Com
      // ela no select, o PostgREST recusava a consulta inteira — e o `catch`
      // abaixo engolia o erro, deixando `schoolsMap` vazio. Consequência: nem o
      // slug nem o **nome** da escola chegavam ao contexto da conta, e quem lê
      // `schoolName`/`schoolSlug` recebia null desde sempre.
      const { data: schoolsData, error: schoolsError } = await db
        .from("schools")
        .select("id, name, tenants(slug)")
        .in("id", schoolIds);
      if (options.strict && (schoolsError || schoolsData?.length !== schoolIds.length)) {
        throw new Error("Não foi possível confirmar as escolas institucionais.");
      }
      if (schoolsData) {
        schoolsMap = new Map(
          schoolsData.map(
            (s: {
              id: string;
              name: string;
              tenants?: { slug?: string | null } | { slug?: string | null }[] | null;
            }) => {
              const tenant = Array.isArray(s.tenants) ? s.tenants[0] : s.tenants;
              return [s.id, { name: s.name, slug: tenant?.slug ?? null }];
            },
          ),
        );
      }
    } catch (schoolError) {
      if (options.strict) throw schoolError;
      /* ignore if schools table query has issues */
    }
  }

  // Papéis de cada vínculo numa só consulta. O embed com a chave explícita
  // (member_roles tem duas chaves para roles) já corre em produção em
  // `features/access/server.ts`.
  const rolesByMembership = new Map<string, Array<{ code: string; name: string }>>();
  if (membershipIds.length) {
    const { data: mrData, error: mrError } = await db
      .from("member_roles")
      .select("membership_id, roles!member_roles_role_id_fkey(code, name)")
      .in("membership_id", membershipIds);
    if (mrError) {
      if (options.strict) throw new Error("Não foi possível confirmar os papéis institucionais.");
      console.error("[listUserSchoolMemberships] error querying roles:", mrError);
    }
    for (const mr of (mrData ?? []) as Array<{
      membership_id: string;
      roles: { code: string; name: string } | Array<{ code: string; name: string }> | null;
    }>) {
      const role = Array.isArray(mr.roles) ? mr.roles[0] : mr.roles;
      if (!role?.code) continue;
      const list = rolesByMembership.get(mr.membership_id) ?? [];
      list.push({ code: String(role.code), name: String(role.name ?? role.code) });
      rolesByMembership.set(mr.membership_id, list);
    }
  }

  return memberships.map((m: { id: string; school_id: string; status: string }) => {
    const schoolInfo = schoolsMap.get(m.school_id);
    const roles = rolesByMembership.get(m.id) ?? [];

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
      isActive: m.status === "active",
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
