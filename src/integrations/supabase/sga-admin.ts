import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveSgaMembership, sgaClient, type SgaMembershipContext } from "./sga";
import type { ApplicationRole } from "@/features/auth/access-policy";
import { ACTIVE_SCHOOL_UNAVAILABLE } from "@/features/auth/active-school";

export async function loadSgaAdminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return sgaClient(supabaseAdmin);
}

/** Import dinâmico como em `loadSgaAdminClient`: só existe do lado do servidor. */
async function readActiveSchoolCookie(): Promise<string | null> {
  try {
    const mod = await import("@/features/auth/active-school-cookie.server");
    return mod.readActiveSchoolCookie();
  } catch {
    return null;
  }
}

/**
 * Resolve a escola do pedido. Sem uma escola explícita, usa a que o utilizador
 * escolheu (cookie) — é isto que faz a troca de escola valer para todas as
 * server functions, e não apenas para o contexto da conta.
 *
 * Falha fechado de propósito: se a escola escolhida não estiver entre as
 * memberships activas, recusa em vez de cair silenciosamente noutra escola.
 * O contrário já causou escritas na escola errada, sem erro visível.
 */
async function resolveMembershipForRequest(
  userId: string,
  preferredSchoolId?: string | null,
): Promise<SgaMembershipContext | null> {
  const db = await loadSgaAdminClient();
  const preferred = preferredSchoolId ?? (await readActiveSchoolCookie());
  const membership = await resolveSgaMembership(db, userId, preferred);
  if (preferred && membership && membership.schoolId !== preferred) {
    throw new Error(ACTIVE_SCHOOL_UNAVAILABLE);
  }
  return membership;
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
  const membership = await resolveMembershipForRequest(userId, preferredSchoolId);
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
  return resolveMembershipForRequest(userId, preferredSchoolId);
}
