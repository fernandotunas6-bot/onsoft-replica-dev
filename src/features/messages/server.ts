import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { loadSgaAdminClient, resolveSgaMembershipAdmin } from "@/integrations/supabase/sga-admin";
import { mapSgaRoleCode } from "@/integrations/supabase/sga";

export type SchoolColleague = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  cargo: string | null;
};

type ProfileRow = {
  id: string;
  full_name?: string | null;
  avatar_url?: string | null;
  cargo?: string | null;
};

/**
 * Quem pode conversar com quem. O pessoal da escola fala com toda a gente;
 * alunos, encarregados e contas sem cargo só com o pessoal. Sem isto, um
 * encarregado (um adulto de fora) escrevia em privado a qualquer aluno, e
 * alunos trocavam mensagens entre si sem supervisão.
 */
const MESSAGING_STAFF_ROLES = new Set(["Administrador", "Secretaria", "Tesouraria", "Professor"]);

export function isMessagingStaff(roles: readonly string[]): boolean {
  return roles.some((role) => MESSAGING_STAFF_ROLES.has(role));
}

/** Cargos da pessoa NESTA escola (não o cargo global do perfil). */
export async function schoolRolesOf(
  db: Awaited<ReturnType<typeof loadSgaAdminClient>>,
  schoolId: string,
  userId: string,
): Promise<string[]> {
  const { data: membershipRow } = await db
    .from("school_memberships")
    .select("id")
    .eq("school_id", schoolId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (!membershipRow) return [];
  const { data: memberRoles } = await db
    .from("member_roles")
    .select("role_id")
    .eq("membership_id", membershipRow.id);
  const roleIds = (memberRoles ?? []).map((row) => String(row.role_id));
  if (!roleIds.length) return [];
  const { data: roles } = await db.from("roles").select("code").in("id", roleIds);
  return (roles ?? []).map((row) => mapSgaRoleCode(String(row.code ?? "")));
}

function mapColleagues(
  userIds: string[],
  profiles: ProfileRow[],
  cargoByUserId: Map<string, string>,
): SchoolColleague[] {
  const byId = new Map(profiles.map((row) => [String(row.id), row]));
  return userIds
    .map((id) => {
      const profile = byId.get(id);
      const fromProfile = String(profile?.cargo ?? "").trim();
      return {
        id,
        full_name: String(profile?.full_name ?? "").trim() || "Colega",
        avatar_url: profile?.avatar_url ? String(profile.avatar_url) : null,
        cargo: fromProfile || cargoByUserId.get(id) || null,
      } satisfies SchoolColleague;
    })
    .sort((a, b) => a.full_name.localeCompare(b.full_name, "pt"));
}

async function loadCargoByUserId(
  db: Awaited<ReturnType<typeof loadSgaAdminClient>>,
  memberships: Array<{ id: string; user_id: string }>,
) {
  const cargoByUserId = new Map<string, string>();
  const membershipIds = memberships.map((row) => row.id);
  if (!membershipIds.length) return cargoByUserId;

  const { data: memberRoles } = await db
    .from("member_roles")
    .select("membership_id, role_id")
    .in("membership_id", membershipIds);
  const roleIds = [...new Set((memberRoles ?? []).map((row) => String(row.role_id)))];
  if (!roleIds.length) return cargoByUserId;

  const { data: roles } = await db.from("roles").select("id, code").in("id", roleIds);
  const roleById = new Map((roles ?? []).map((row) => [String(row.id), String(row.code ?? "")]));
  const membershipUser = new Map(memberships.map((row) => [row.id, String(row.user_id)]));

  for (const row of memberRoles ?? []) {
    const userId = membershipUser.get(String(row.membership_id));
    if (!userId) continue;
    const cargo = mapSgaRoleCode(roleById.get(String(row.role_id)));
    const current = cargoByUserId.get(userId);
    if (!current || cargo === "Administrador") cargoByUserId.set(userId, cargo);
  }
  return cargoByUserId;
}

/** Colegas visíveis para esta pessoa nesta escola. Extraído do server fn para
 *  que o chat (chat-server.ts) use a mesma regra sem chamar um server fn de
 *  dentro de outro. */
export async function loadSchoolColleagues(
  db: Awaited<ReturnType<typeof loadSgaAdminClient>>,
  membership: NonNullable<Awaited<ReturnType<typeof resolveSgaMembershipAdmin>>>,
  viewerId: string,
): Promise<SchoolColleague[]> {
  const { data: rows, error } = await db
    .from("school_memberships")
    .select("id, user_id, status")
    .eq("school_id", membership.schoolId)
    .eq("status", "active");
  if (error) throw publicDatabaseError(error, "Não foi possível listar os colegas.");

  const memberships = (rows ?? [])
    .map((row) => ({ id: String(row.id), user_id: String(row.user_id) }))
    .filter((row) => row.user_id !== viewerId);
  const userIds = [...new Set(memberships.map((row) => row.user_id))];
  if (!userIds.length) return [] as SchoolColleague[];

  const cargoByUserId = await loadCargoByUserId(db, memberships);
  // Alunos e encarregados só vêem o pessoal da escola.
  const viewerIsStaff = isMessagingStaff(membership.allAppRoles ?? [membership.appRole]);
  const visibleIds = viewerIsStaff
    ? userIds
    : userIds.filter((id) => isMessagingStaff([cargoByUserId.get(id) ?? ""]));
  if (!visibleIds.length) return [] as SchoolColleague[];

  const { data: profiles, error: profileError } = await db
    .from("profiles")
    .select("id, full_name, avatar_url, cargo")
    .in("id", visibleIds);
  if (profileError && /avatar_url|cargo|42703|schema cache/i.test(profileError.message)) {
    const { data: fallback } = await db
      .from("profiles")
      .select("id, full_name")
      .in("id", visibleIds);
    return mapColleagues(visibleIds, fallback ?? [], cargoByUserId);
  }
  if (profileError) {
    throw publicDatabaseError(profileError, "Não foi possível ler os perfis.");
  }

  return mapColleagues(visibleIds, profiles ?? [], cargoByUserId);
}

export const listSchoolColleagues = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!context) throw new Error("Unauthorized");
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem membership activa nesta escola.");
    const db = await loadSgaAdminClient();
    return loadSchoolColleagues(db, membership, context.userId);
  });
