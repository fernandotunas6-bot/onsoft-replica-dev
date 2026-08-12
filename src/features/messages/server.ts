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

    const { data: profiles, error: profileError } = await db
      .from("profiles")
      .select("id, full_name, avatar_url, cargo")
      .in("id", userIds);
    if (profileError && /avatar_url|cargo|42703|schema cache/i.test(profileError.message)) {
      const { data: fallback } = await db
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      return mapColleagues(userIds, fallback ?? [], cargoByUserId);
    }
    if (profileError) {
      throw publicDatabaseError(profileError, "Não foi possível ler os perfis.");
    }

    return mapColleagues(userIds, profiles ?? [], cargoByUserId);
  });

export const listDirectThread = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => listDirectThreadInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem membership activa nesta escola.");
    const db = await loadSgaAdminClient();

    const { data: rows, error } = await db
      .from("siga_direct_messages")
      .select("id, sender_id, recipient_id, body, created_at")
      .eq("school_id", membership.schoolId)
      .or(
        `and(sender_id.eq.${context.userId},recipient_id.eq.${data.peerId}),and(sender_id.eq.${data.peerId},recipient_id.eq.${context.userId})`,
      )
      .order("created_at", { ascending: true })
      .limit(data.limit);

    if (error) {
      if (missingMessagesTable(error)) {
        return { messages: [], storage: "local" as const };
      }
      throw publicDatabaseError(error, "Não foi possível carregar a conversa.");
    }

    return {
      storage: "sga" as const,
      messages: (rows ?? []).map((row) => ({
        id: String(row.id),
        senderId: String(row.sender_id),
        body: String(row.body ?? ""),
        createdAt: String(row.created_at),
        mine: String(row.sender_id) === context.userId,
      })),
    };
  });

export const sendDirectMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => sendDirectMessageInputSchema.parse(input))
  .handler(async ({ data, context }) => {
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

    const { data: row, error } = await db
      .from("siga_direct_messages")
      .insert({
        school_id: membership.schoolId,
        sender_id: context.userId,
        recipient_id: data.peerId,
        body: data.body,
        created_by: context.userId,
      })
      .select("id, sender_id, body, created_at")
      .single();

    if (error) {
      if (missingMessagesTable(error)) {
        return {
          storage: "local" as const,
          message: {
            id: crypto.randomUUID(),
            senderId: context.userId,
            body: data.body,
            createdAt: new Date().toISOString(),
            mine: true,
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
      },
    };
  });

export const listInboxPreviews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const membership = await resolveSgaMembershipAdmin(context.userId);
    if (!membership) throw new Error("Sem membership activa nesta escola.");
    const db = await loadSgaAdminClient();

    const { data: rows, error } = await db
      .from("siga_direct_messages")
      .select("sender_id, body, created_at")
      .eq("school_id", membership.schoolId)
      .eq("recipient_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      if (missingMessagesTable(error)) {
        return { storage: "local" as const, previews: [] as InboxPreview[] };
      }
      throw publicDatabaseError(error, "Não foi possível ler as mensagens recebidas.");
    }

    const latest = new Map<string, { lastIncomingAt: string; lastBody: string }>();
    for (const row of rows ?? []) {
      const peerId = String(row.sender_id);
      if (latest.has(peerId)) continue;
      latest.set(peerId, {
        lastIncomingAt: String(row.created_at),
        lastBody: String(row.body ?? "").slice(0, 140),
      });
    }

    const peerIds = [...latest.keys()];
    const { data: profiles } = peerIds.length
      ? await db.from("profiles").select("id, full_name, avatar_url").in("id", peerIds)
      : { data: [] as Array<{ id: string; full_name?: string | null; avatar_url?: string | null }> };
    const byId = new Map((profiles ?? []).map((row) => [String(row.id), row]));

    return {
      storage: "sga" as const,
      previews: peerIds.map((peerId) => {
        const preview = latest.get(peerId)!;
        const profile = byId.get(peerId);
        return {
          peerId,
          full_name: String(profile?.full_name ?? "").trim() || "Colega",
          avatar_url: profile?.avatar_url ? String(profile.avatar_url) : null,
          lastIncomingAt: preview.lastIncomingAt,
          lastBody: preview.lastBody,
        } satisfies InboxPreview;
      }),
    };
  });
