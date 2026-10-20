import type { requireMobileAcademicAccess } from "./authorization";
import { mapSgaRoleCode } from "@/integrations/supabase/sga";
import { canShareFileInMessage, loadAttachableFile } from "@/features/messages/attachments";
import { MobileApiError } from "./errors";
type Db = Awaited<ReturnType<typeof requireMobileAcademicAccess>>["db"];
async function rows<T>(
  q: PromiseLike<{ data: T[] | null; error: unknown; count: number | null }>,
): Promise<T[]> {
  const r = await q;
  if (r.error || !r.data || r.count !== r.data.length)
    throw new MobileApiError(503, "CHAT_UNAVAILABLE");
  return r.data;
}
export async function chatSchoolRoles(db: Db, schoolId: string, userIds: string[]) {
  const memberships = await rows<{ id: string; user_id: string }>(
    db
      .from("school_memberships")
      .select("id, user_id", { count: "exact" })
      .eq("school_id", schoolId)
      .eq("status", "active")
      .in("user_id", userIds)
      .limit(1000),
  );
  const result = new Map<string, string[]>();
  memberships.forEach((m) => result.set(m.user_id, []));
  if (!memberships.length) return result;
  const memberRoles = await rows<{ membership_id: string; role_id: string }>(
    db
      .from("member_roles")
      .select("membership_id, role_id", { count: "exact" })
      .in(
        "membership_id",
        memberships.map((m) => m.id),
      )
      .limit(1000),
  );
  if (!memberRoles.length) return result;
  const roles = await rows<{ id: string; code: string }>(
    db
      .from("roles")
      .select("id, code", { count: "exact" })
      .in("id", [...new Set(memberRoles.map((r) => r.role_id))])
      .limit(1000),
  );
  for (const r of memberRoles) {
    const user = memberships.find((m) => m.id === r.membership_id)!.user_id;
    const role = roles.find((x) => x.id === r.role_id);
    if (!role) throw new MobileApiError(503, "CHAT_INCONSISTENT");
    result.get(user)!.push(mapSgaRoleCode(role.code));
  }
  return result;
}
const isStaff = (roles: readonly string[]) =>
  roles.some((r) => ["Administrador", "Secretaria", "Tesouraria", "Professor"].includes(r));
export async function readMobileChatContacts(
  db: Db,
  schoolId: string,
  userId: string,
  viewerRoles: readonly string[],
) {
  const peers = await rows<{ user_id: string }>(
    db
      .from("school_memberships")
      .select("user_id", { count: "exact" })
      .eq("school_id", schoolId)
      .eq("status", "active")
      .neq("user_id", userId)
      .limit(1000),
  );
  if (!peers.length) return [];
  const roleMap = await chatSchoolRoles(
    db,
    schoolId,
    peers.map((p) => p.user_id),
  );
  const visible = peers.filter(
    (p) => isStaff(viewerRoles) || isStaff(roleMap.get(p.user_id) ?? []),
  );
  if (!visible.length) return [];
  const profiles = await rows<{ id: string; full_name: string | null }>(
    db
      .from("profiles")
      .select("id, full_name", { count: "exact" })
      .in(
        "id",
        visible.map((p) => p.user_id),
      )
      .limit(1000),
  );
  return visible
    .map((p) => ({
      id: p.user_id,
      name: profiles.find((x) => x.id === p.user_id)?.full_name?.trim() || "Nome não disponível",
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt"));
}
export async function signMobileChatAttachment(
  db: Db,
  schoolId: string,
  userId: string,
  messageId: string,
) {
  const message = await db
    .from("siga_chat_messages")
    .select("conversation_id, sender_id, attachment_file_id, deleted_at")
    .eq("id", messageId)
    .eq("school_id", schoolId)
    .maybeSingle();
  if (message.error) throw new MobileApiError(503, "CHAT_UNAVAILABLE");
  if (!message.data || message.data.deleted_at || !message.data.attachment_file_id)
    throw new MobileApiError(404, "ATTACHMENT_NOT_FOUND");
  const conversation = await db
    .from("siga_chat_conversations")
    .select("id")
    .eq("id", message.data.conversation_id)
    .eq("school_id", schoolId)
    .maybeSingle();
  const member = await db
    .from("siga_chat_members")
    .select("user_id")
    .eq("conversation_id", message.data.conversation_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (member.error || conversation.error) throw new MobileApiError(503, "CHAT_UNAVAILABLE");
  if (!member.data || !conversation.data) throw new MobileApiError(403, "CHAT_FORBIDDEN");
  const file = await loadAttachableFile(db, schoolId, message.data.attachment_file_id);
  const roles = await chatSchoolRoles(db, schoolId, [message.data.sender_id]);
  if (
    !file ||
    !canShareFileInMessage(file, message.data.sender_id, roles.get(message.data.sender_id) ?? [])
  )
    throw new MobileApiError(403, "ATTACHMENT_FORBIDDEN");
  if (file.storageBackend !== "sga" || !file.storagePath)
    throw new MobileApiError(503, "ATTACHMENT_STORAGE_UNAVAILABLE");
  const signed = await db.storage.from("siga-files").createSignedUrl(file.storagePath, 600);
  if (signed.error || !signed.data?.signedUrl)
    throw new MobileApiError(503, "ATTACHMENT_STORAGE_UNAVAILABLE");
  return { url: signed.data.signedUrl };
}
