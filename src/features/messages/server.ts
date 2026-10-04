import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { loadSgaAdminClient, resolveSgaMembershipAdmin } from "@/integrations/supabase/sga-admin";
import { mapSgaRoleCode } from "@/integrations/supabase/sga";
import {
  listDirectThreadInputSchema,
  sendDirectMessageInputSchema,
  type InboxPreview,
} from "./schemas";

const MISSING_TABLE = /schema cache|does not exist|42P01|PGRST/i;

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

function missingMessagesTable(error: { message?: string } | null) {
  return Boolean(error?.message && MISSING_TABLE.test(error.message));
}

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
async function schoolRolesOf(
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

export const listSchoolColleagues = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!context) throw new Error("Unauthorized");
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem membership activa nesta escola.");
    const db = await loadSgaAdminClient();

    const { data: rows, error } = await db
      .from("school_memberships")
      .select("id, user_id, status")
      .eq("school_id", membership.schoolId)
      .eq("status", "active");
    if (error) throw publicDatabaseError(error, "Não foi possível listar os colegas.");

    const memberships = (rows ?? [])
      .map((row) => ({ id: String(row.id), user_id: String(row.user_id) }))
      .filter((row) => row.user_id !== context.userId);
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
  });

export const listDirectThread = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => listDirectThreadInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Unauthorized");
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem membership activa nesta escola.");
    const db = await loadSgaAdminClient();

    const { data: rows, error } = await db
      .from("siga_direct_messages")
      .select(
        "id, sender_id, recipient_id, body, attachment_file_id, attachment_file_name, created_at",
      )
      .eq("school_id", membership.schoolId)
      .or(
        `and(sender_id.eq.${context.userId},recipient_id.eq.${data.peerId}),and(sender_id.eq.${data.peerId},recipient_id.eq.${context.userId})`,
      )
      // As mais recentes primeiro e depois invertidas: com ascending + limit, uma
      // conversa com mais mensagens do que o limite mostrava só as mais antigas.
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (error) {
      if (missingMessagesTable(error)) {
        return { messages: [], storage: "local" as const };
      }
      throw publicDatabaseError(error, "Não foi possível carregar a conversa.");
    }

    return {
      storage: "sga" as const,
      messages: [...(rows ?? [])].reverse().map((row) => ({
        id: String(row.id),
        senderId: String(row.sender_id),
        body: String(row.body ?? ""),
        createdAt: String(row.created_at),
        mine: String(row.sender_id) === context.userId,
        attachmentFileId: row.attachment_file_id ? String(row.attachment_file_id) : null,
        attachmentFileName: row.attachment_file_name ? String(row.attachment_file_name) : null,
      })),
    };
  });

export const sendDirectMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => sendDirectMessageInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context) throw new Error("Unauthorized");
    if (data.peerId === context.userId) {
      throw new Error("Não pode enviar uma mensagem para si próprio.");
    }
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem membership activa nesta escola.");
    const db = await loadSgaAdminClient();

    const { data: peer } = await db
      .from("school_memberships")
      .select("user_id")
      .eq("school_id", membership.schoolId)
      .eq("user_id", data.peerId)
      .eq("status", "active")
      .maybeSingle();
    if (!peer) throw new Error("Este utilizador não pertence à escola.");
    if (!isMessagingStaff(membership.allAppRoles ?? [membership.appRole])) {
      const peerRoles = await schoolRolesOf(db, membership.schoolId, data.peerId);
      if (!isMessagingStaff(peerRoles)) {
        throw new Error("Só pode enviar mensagens ao pessoal da escola.");
      }
    }

    const { data: row, error } = await db
      .from("siga_direct_messages")
      .insert({
        school_id: membership.schoolId,
        sender_id: context.userId,
        recipient_id: data.peerId,
        body: data.body?.trim() || null,
        attachment_file_id: data.attachmentFileId ?? null,
        attachment_file_name: data.attachmentFileName ?? null,
        created_by: context.userId,
      })
      .select("id, sender_id, body, attachment_file_id, attachment_file_name, created_at")
      .single();

    if (error) {
      if (missingMessagesTable(error)) {
        return {
          storage: "local" as const,
          message: {
            id: crypto.randomUUID(),
            senderId: context.userId,
            body: data.body ?? "",
            createdAt: new Date().toISOString(),
            mine: true,
            attachmentFileId: data.attachmentFileId ?? null,
            attachmentFileName: data.attachmentFileName ?? null,
          },
        };
      }
      throw publicDatabaseError(error, "Não foi possível enviar a mensagem.");
    }

    return {
      storage: "sga" as const,
      message: {
        id: String(row.id),
        senderId: String(row.sender_id),
        body: String(row.body ?? ""),
        createdAt: String(row.created_at),
        mine: true,
        attachmentFileId: row.attachment_file_id ? String(row.attachment_file_id) : null,
        attachmentFileName: row.attachment_file_name ? String(row.attachment_file_name) : null,
      },
    };
  });

export const listInboxPreviews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!context) throw new Error("Unauthorized");
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem membership activa nesta escola.");
    const db = await loadSgaAdminClient();

    // Ambas as direcções: uma conversa que só tens enviado (sem resposta ainda) tem
    // de aparecer na lista na mesma — só não conta para "não lidas".
    const { data: rows, error } = await db
      .from("siga_direct_messages")
      .select("sender_id, recipient_id, body, attachment_file_name, created_at")
      .eq("school_id", membership.schoolId)
      .or(`sender_id.eq.${context.userId},recipient_id.eq.${context.userId}`)
      .order("created_at", { ascending: false })
      .limit(400);

    if (error) {
      if (missingMessagesTable(error)) {
        return { storage: "local" as const, previews: [] as InboxPreview[] };
      }
      throw publicDatabaseError(error, "Não foi possível ler as mensagens.");
    }

    const latestActivity = new Map<string, { lastActivityAt: string; lastBody: string }>();
    const latestIncoming = new Map<string, string>();
    for (const row of rows ?? []) {
      const incoming = String(row.recipient_id) === context.userId;
      const peerId = incoming ? String(row.sender_id) : String(row.recipient_id);
      if (!latestActivity.has(peerId)) {
        const body = String(row.body ?? "").trim();
        latestActivity.set(peerId, {
          lastActivityAt: String(row.created_at),
          lastBody: body
            ? body.slice(0, 140)
            : row.attachment_file_name
              ? `📎 ${String(row.attachment_file_name)}`
              : "",
        });
      }
      if (incoming && !latestIncoming.has(peerId)) {
        latestIncoming.set(peerId, String(row.created_at));
      }
    }

    const peerIds = [...latestActivity.keys()];
    const { data: profiles } = peerIds.length
      ? await db.from("profiles").select("id, full_name, avatar_url").in("id", peerIds)
      : {
          data: [] as Array<{ id: string; full_name?: string | null; avatar_url?: string | null }>,
        };
    const byId = new Map((profiles ?? []).map((row) => [String(row.id), row]));

    return {
      storage: "sga" as const,
      previews: peerIds.map((peerId) => {
        const preview = latestActivity.get(peerId)!;
        const profile = byId.get(peerId);
        return {
          peerId,
          full_name: String(profile?.full_name ?? "").trim() || "Colega",
          avatar_url: profile?.avatar_url ? String(profile.avatar_url) : null,
          lastActivityAt: preview.lastActivityAt,
          lastBody: preview.lastBody,
          lastIncomingAt: latestIncoming.get(peerId) ?? null,
        } satisfies InboxPreview;
      }),
    };
  });
