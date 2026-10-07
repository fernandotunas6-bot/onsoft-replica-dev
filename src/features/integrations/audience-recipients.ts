/**
 * Destinatários do envio de um comunicado por e-mail, WhatsApp ou SMS
 * (auditoria 13).
 *
 * Antes, sem lista explícita, o envio ia para os primeiros 80 vínculos activos
 * da escola, fossem quem fossem — alunos, encarregados, pessoal — e ignorava o
 * público do comunicado: um aviso "Corpo docente" chegava a encarregados, e um
 * aviso "Todos os encarregados" chegava a quem calhasse. No e-mail, todos os
 * endereços iam no mesmo "Para", à vista de cada destinatário.
 *
 * Agora o público decide, pelos cargos da pessoa nesta escola. Os públicos que
 * dependem de dados que não estão nos cargos (ciclo, finalistas, dívida,
 * antigos alunos) não têm envio automático: o comunicado fica no portal e quem
 * envia é avisado, em vez de sair para as pessoas erradas.
 */
import type { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { mapSgaRoleCode } from "@/integrations/supabase/sga";
import { selectAllPages } from "@/features/import/engine/paged";

type AdminDb = Awaited<ReturnType<typeof loadSgaAdminClient>>;

/** O mesmo tecto dos normalizadores de destinatários (e-mail, WhatsApp, SMS). */
export const DISPATCH_MAX_RECIPIENTS = 50;

const STAFF_ROLES = ["Administrador", "Secretaria", "Tesouraria", "Professor"] as const;

const AUDIENCE_LABEL: Record<string, string> = {
  guardians_with_debt: "Encarregados em dívida",
  students_secondary: "Alunos do secundário",
  students_finalists: "Finalistas",
};

/**
 * Cargos que recebem o envio deste público. Sem público (envio avulso) é o
 * pessoal da escola. `null`: público sem envio automático.
 */
export function audienceDispatchRoles(audience: string | undefined): readonly string[] | null {
  if (!audience || audience === "teaching_staff") return STAFF_ROLES;
  if (audience === "all_guardians") return ["Encarregado"];
  return null;
}

export function unsupportedAudienceReason(audience: string): string {
  const label = audience.startsWith("alumni_")
    ? "Antigos alunos"
    : (AUDIENCE_LABEL[audience] ?? audience);
  return `O envio automático para «${label}» ainda não está disponível: o comunicado ficou no portal.`;
}

export function tooManyRecipientsReason(count: number): string {
  return `Este público tem ${count} contactos e o envio automático vai até ${DISPATCH_MAX_RECIPIENTS}: nada foi enviado. O comunicado ficou no portal.`;
}

const ID_CHUNK = 150;

function chunks<T>(items: T[], size = ID_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Utilizadores com vínculo activo nesta escola e um dos `roles`. */
export async function listAudienceUserIds(
  db: AdminDb,
  schoolId: string,
  roles: readonly string[],
): Promise<string[]> {
  const memberships = await selectAllPages<{ id: string; user_id: string }>(
    (from, to) =>
      db
        .from("school_memberships")
        .select("id, user_id")
        .eq("school_id", schoolId)
        .eq("status", "active")
        .order("id")
        .range(from, to),
    "Não foi possível ler os membros da escola",
  );
  if (!memberships.length) return [];
  const memberRoles = await selectAllPages<{ membership_id: string; role_id: string }>(
    (from, to) =>
      db
        .from("member_roles")
        .select("membership_id, role_id")
        .eq("school_id", schoolId)
        .order("membership_id")
        .order("role_id")
        .range(from, to),
    "Não foi possível ler os cargos da escola",
  );
  const roleIds = [...new Set(memberRoles.map((row) => String(row.role_id)))];
  if (!roleIds.length) return [];
  const { data: roleRows, error } = await db.from("roles").select("id, code").in("id", roleIds);
  if (error) throw new Error(`Não foi possível ler os cargos: ${error.message}`);
  const wanted = new Set(roles);
  const matchingRoleIds = new Set(
    (roleRows ?? [])
      .filter((row) => wanted.has(mapSgaRoleCode(String(row.code ?? ""))))
      .map((row) => String(row.id)),
  );
  const userByMembership = new Map(memberships.map((row) => [String(row.id), String(row.user_id)]));
  const users = new Set<string>();
  for (const row of memberRoles) {
    if (!matchingRoleIds.has(String(row.role_id))) continue;
    const userId = userByMembership.get(String(row.membership_id));
    if (userId) users.add(userId);
  }
  return [...users];
}

/** E-mails desses utilizadores nesta escola (ficha da pessoa). */
export async function listAudienceEmails(
  db: AdminDb,
  schoolId: string,
  userIds: string[],
): Promise<string[]> {
  const emails: string[] = [];
  for (const ids of chunks(userIds)) {
    const { data, error } = await db
      .from("people")
      .select("email")
      .eq("school_id", schoolId)
      .in("user_id", ids)
      .is("deleted_at", null);
    if (error) throw new Error(`Não foi possível ler os e-mails: ${error.message}`);
    for (const row of data ?? []) if (row.email) emails.push(String(row.email));
  }
  return emails;
}

/** Telemóveis desses utilizadores: ficha da pessoa nesta escola, depois o perfil. */
export async function listAudiencePhones(
  db: AdminDb,
  schoolId: string,
  userIds: string[],
): Promise<string[]> {
  const phones: string[] = [];
  for (const ids of chunks(userIds)) {
    const [people, profiles] = await Promise.all([
      db
        .from("people")
        .select("user_id, phone")
        .eq("school_id", schoolId)
        .in("user_id", ids)
        .is("deleted_at", null),
      db.from("profiles").select("id, phone").in("id", ids),
    ]);
    if (people.error)
      throw new Error(`Não foi possível ler os telemóveis: ${people.error.message}`);
    const withPhone = new Set<string>();
    for (const row of people.data ?? []) {
      if (!row.phone) continue;
      phones.push(String(row.phone));
      withPhone.add(String(row.user_id));
    }
    for (const row of profiles.data ?? []) {
      if (row.phone && !withPhone.has(String(row.id))) phones.push(String(row.phone));
    }
  }
  return phones;
}
