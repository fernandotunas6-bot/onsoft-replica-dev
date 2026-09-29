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

/**
 * Compatibilidade: módulos legados chamam (client, userId, roles, school),
 * enquanto server functions recentes já autenticadas podem chamar (userId, roles, school).
 */
function parseWriterArgs(
  clientOrUserId: SupabaseClient | string,
  userIdOrRoles?: string | ApplicationRole[],
  rolesOrPreferred?: ApplicationRole[] | string | null,
  preferredSchoolIdArg?: string | null,
) {
  const directUserId = typeof clientOrUserId === "string";
  const userId = directUserId ? clientOrUserId : String(userIdOrRoles ?? "");
  const roles = directUserId
    ? Array.isArray(userIdOrRoles)
      ? userIdOrRoles
      : undefined
    : Array.isArray(rolesOrPreferred)
      ? rolesOrPreferred
      : undefined;
  const preferredSchoolId = directUserId
    ? typeof rolesOrPreferred === "string" || rolesOrPreferred === null
      ? rolesOrPreferred
      : undefined
    : preferredSchoolIdArg;
  if (!userId) throw new Error("Sessão inválida. Termine e volte a entrar.");
  const allowedRoles: ApplicationRole[] = roles ?? ["Administrador", "Secretaria", "Tesouraria"];
  return { userId, allowedRoles, preferredSchoolId };
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
  const { userId, allowedRoles, preferredSchoolId } = parseWriterArgs(
    clientOrUserId,
    userIdOrRoles,
    rolesOrPreferred,
    preferredSchoolIdArg,
  );
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

/** Chaves de módulo das permissões por conta (`staff_module_grants.module_key`). */
export type ModuleGrantKey =
  "pessoas" | "financeiro" | "pedagogica" | "gestao" | "arquivos" | "importacao";

const MODULE_LABELS: Record<ModuleGrantKey, string> = {
  pessoas: "Pessoas",
  financeiro: "Financeiro",
  pedagogica: "Pedagógica",
  gestao: "Gestão",
  arquivos: "Arquivos",
  importacao: "Importar Dados",
};

/**
 * Aplica no servidor o bloqueio "Nenhum" das permissões por módulo. Até aqui
 * só o browser o respeitava (canAccessPath): a conta deixava de ver o módulo,
 * mas continuava a chamar as funções dele directamente.
 *
 * Só bloqueia — não eleva: quem não tem o papel continua recusado por
 * requireSgaWriter. Em modo "write", "Leitura" também bloqueia.
 */
async function readModuleGrant(
  schoolId: string,
  userId: string,
  moduleKey: ModuleGrantKey,
): Promise<string | null> {
  const db = await loadSgaAdminClient();
  const { data, error } = await db
    .from("staff_module_grants")
    .select("level")
    .eq("school_id", schoolId)
    .eq("user_id", userId)
    .eq("module_key", moduleKey)
    .maybeSingle();
  if (error) {
    // Tabela ausente (SQL por aplicar) = sem sobreposições, como em getCurrentAccountContext.
    if (isMissingRelation(error)) return null;
    // Qualquer outro erro falha fechado: devolver null aqui ignorava o bloqueio
    // "Nenhum" sempre que a leitura falhasse.
    throw new Error("Não foi possível confirmar as permissões desta conta. Tente novamente.");
  }
  return data?.level ? String(data.level) : null;
}

function isMissingRelation(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /relation .* does not exist|could not find the table/i.test(error.message ?? "")
  );
}

/** Cargos que uma permissão por módulo pode elevar. Alunos e encarregados, nunca. */
export const GRANT_ELEVATABLE_ROLES: readonly ApplicationRole[] = [
  "Secretaria",
  "Tesouraria",
  "Professor",
];

/**
 * A permissão por módulo dá acesso a quem não tem o cargo da função?
 *
 * - só a pessoal (Secretaria, Tesouraria, Professor);
 * - nunca a funções só do Administrador: a permissão alarga o acesso de
 *   departamento, não dá poderes de administrador;
 * - "Leitura" para consultar, "Escrita" ou "Total" para alterar.
 */
export function grantElevates(
  role: ApplicationRole,
  allowedRoles: readonly ApplicationRole[],
  level: string | null,
  mode: "read" | "write",
): boolean {
  if (!GRANT_ELEVATABLE_ROLES.includes(role)) return false;
  if (!allowedRoles.some((allowed) => allowed !== "Administrador")) return false;
  if (level === "Escrita" || level === "Total") return true;
  return mode === "read" && level === "Leitura";
}

export async function assertModuleNotBlocked(
  schoolId: string,
  userId: string,
  moduleKey: ModuleGrantKey,
  mode: "read" | "write" = "read",
): Promise<void> {
  const level = await readModuleGrant(schoolId, userId, moduleKey);
  if (level === "Nenhum") {
    throw new Error(`O acesso ao módulo ${MODULE_LABELS[moduleKey]} foi retirado a esta conta.`);
  }
  if (mode === "write" && level === "Leitura") {
    throw new Error(`Esta conta só tem leitura no módulo ${MODULE_LABELS[moduleKey]}.`);
  }
}

type SgaWriterArgs = [
  clientOrUserId: SupabaseClient | string,
  userIdOrRoles?: string | ApplicationRole[],
  rolesOrPreferred?: ApplicationRole[] | string | null,
  preferredSchoolIdArg?: string | null,
];

async function requireSgaWriterWithMode(
  mode: "read" | "write",
  moduleKey: ModuleGrantKey,
  ...[clientOrUserId, userIdOrRoles, rolesOrPreferred, preferredSchoolIdArg]: SgaWriterArgs
): Promise<SgaMembershipContext> {
  const { userId, allowedRoles, preferredSchoolId } = parseWriterArgs(
    clientOrUserId,
    userIdOrRoles,
    rolesOrPreferred,
    preferredSchoolIdArg,
  );
  const membership = await resolveMembershipForRequest(userId, preferredSchoolId);
  if (!membership) throw new Error("Sem membership activa nesta escola.");
  if (allowedRoles.includes(membership.appRole)) {
    await assertModuleNotBlocked(membership.schoolId, userId, moduleKey, mode);
    return membership;
  }
  // Sem o cargo: só entra se a Administração lhe deu esta permissão por módulo.
  const level = await readModuleGrant(membership.schoolId, userId, moduleKey);
  if (grantElevates(membership.appRole, allowedRoles, level, mode)) return membership;
  throw new Error("Sem permissão para esta operação na escola.");
}

/** Funções de leitura: requireSgaWriter + bloqueio "Nenhum" do módulo. */
export function requireSgaWriterFor(moduleKey: ModuleGrantKey, ...args: SgaWriterArgs) {
  return requireSgaWriterWithMode("read", moduleKey, ...args);
}

/** Funções que alteram dados: bloqueia "Nenhum" e "Leitura". */
export function requireSgaWriterForWrite(moduleKey: ModuleGrantKey, ...args: SgaWriterArgs) {
  return requireSgaWriterWithMode("write", moduleKey, ...args);
}
