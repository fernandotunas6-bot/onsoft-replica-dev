import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveSgaMembership, sgaClient, type SgaMembershipContext } from "./sga";
import type { ApplicationRole } from "@/features/auth/access-policy";

export async function loadSgaAdminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return sgaClient(supabaseAdmin);
}

export function requireSgaWriter(
  userId: string,
  roles?: ApplicationRole[],
  preferredSchoolId?: string | null,
): Promise<SgaMembershipContext>;
export function requireSgaWriter(
  client: SupabaseClient,
  userId: string,
  roles?: ApplicationRole[],
  preferredSchoolId?: string | null,
): Promise<SgaMembershipContext>;
export async function requireSgaWriter(
  clientOrUserId: SupabaseClient | string,
  userIdOrRoles?: string | ApplicationRole[],
  rolesOrPreferred?: ApplicationRole[] | string | null,
  preferredSchoolIdArg?: string | null,
): Promise<SgaMembershipContext> {
  // Compatibilidade: módulos legados chamam (client, userId, roles, school),
  // enquanto server functions recentes já autenticadas podem chamar (userId, roles, school).
  const directUserId = typeof clientOrUserId === "string";
  const userId = directUserId ? clientOrUserId : String(userIdOrRoles ?? "");
  const roles = directUserId
    ? (Array.isArray(userIdOrRoles) ? userIdOrRoles : undefined)
    : (Array.isArray(rolesOrPreferred) ? rolesOrPreferred : undefined);
  const preferredSchoolId = directUserId
    ? (typeof rolesOrPreferred === "string" || rolesOrPreferred === null ? rolesOrPreferred : undefined)
    : preferredSchoolIdArg;

  if (!userId) throw new Error("Sessão inválida. Termine e volte a entrar.");
  const allowedRoles: ApplicationRole[] = roles ?? ["Administrador", "Secretaria", "Tesouraria"];
  const db = await loadSgaAdminClient();
  const membership = await resolveSgaMembership(db, userId, preferredSchoolId);
  if (!membership) throw new Error("Sem membership activa nesta escola.");
  if (!allowedRoles.includes(membership.appRole)) {
    throw new Error("Sem permissão para esta operação na escola.");
  }
  return membership;
}

/** Resolve membership/role for any authenticated user (read paths). */
export async function resolveSgaMembershipAdmin(
  userId: string,
  preferredSchoolId?: string | null,
): Promise<SgaMembershipContext | null> {
  const db = await loadSgaAdminClient();
  return resolveSgaMembership(db, userId, preferredSchoolId);
}
